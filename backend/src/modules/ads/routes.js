const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { optionalString, requireString } = require("../../utils/validators");

const CAMPAIGN_STATUSES = new Set(["draft", "active", "paused", "ended"]);

function normalizeCurrency(value) {
  return String(value || "usd")
    .trim()
    .toLowerCase()
    .slice(0, 3);
}

function createAdsRouter({ db, config, analytics }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  router.post(
    "/campaigns",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const postId = Number(req.body?.postId);
      const budgetMinor = Number(req.body?.budgetMinor);
      const currency = normalizeCurrency(req.body?.currency || "usd");
      const dailyCapImpressions = Math.min(
        Math.max(Number(req.body?.dailyCapImpressions) || 1000, 100),
        100000
      );
      const startsAt = optionalString(req.body?.startsAt, "startsAt", 64) || null;
      const endsAt = optionalString(req.body?.endsAt, "endsAt", 64) || null;
      if (!postId || !Number.isInteger(budgetMinor) || budgetMinor <= 0) {
        throw httpError(400, "postId and budgetMinor are required");
      }
      const ownerCheck = await db.query(
        `SELECT id FROM posts WHERE id = $1 AND author_id = $2 LIMIT 1`,
        [postId, req.user.id]
      );
      if (ownerCheck.rowCount === 0) {
        throw httpError(404, "Post not found");
      }
      const created = await db.query(
        `INSERT INTO ad_campaigns (
           creator_user_id, post_id, status, budget_minor, spent_minor, currency, daily_cap_impressions, starts_at, ends_at
         )
         VALUES ($1, $2, 'draft', $3, 0, $4, $5, $6::timestamptz, $7::timestamptz)
         RETURNING *`,
        [req.user.id, postId, budgetMinor, currency, dailyCapImpressions, startsAt, endsAt]
      );
      await db.query(
        `INSERT INTO ad_creative_reviews (campaign_id, status)
         VALUES ($1, 'pending')
         ON CONFLICT (campaign_id) DO NOTHING`,
        [created.rows[0].id]
      );
      if (analytics) {
        await analytics.trackEvent("ad_campaign_create", {
          userId: req.user.id,
          campaignId: created.rows[0].id,
          postId
        });
      }
      res.status(201).json(created.rows[0]);
    })
  );

  router.patch(
    "/campaigns/:id",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const campaignId = Number(req.params.id);
      if (!campaignId) {
        throw httpError(400, "campaign id must be a number");
      }
      const currentResult = await db.query(
        `SELECT * FROM ad_campaigns WHERE id = $1 AND creator_user_id = $2 LIMIT 1`,
        [campaignId, req.user.id]
      );
      if (currentResult.rowCount === 0) {
        throw httpError(404, "Campaign not found");
      }
      const current = currentResult.rows[0];
      const status =
        req.body?.status !== undefined ? String(req.body.status).trim().toLowerCase() : current.status;
      if (!CAMPAIGN_STATUSES.has(status)) {
        throw httpError(400, "status must be draft, active, paused, or ended");
      }
      const budgetMinor =
        req.body?.budgetMinor !== undefined ? Number(req.body.budgetMinor) : current.budget_minor;
      if (!Number.isInteger(budgetMinor) || budgetMinor <= 0) {
        throw httpError(400, "budgetMinor must be a positive integer");
      }
      const dailyCapImpressions =
        req.body?.dailyCapImpressions !== undefined
          ? Math.min(Math.max(Number(req.body.dailyCapImpressions), 100), 100000)
          : current.daily_cap_impressions;
      const updated = await db.query(
        `UPDATE ad_campaigns
         SET status = $3,
             budget_minor = $4,
             daily_cap_impressions = $5,
             updated_at = NOW()
         WHERE id = $1
           AND creator_user_id = $2
         RETURNING *`,
        [campaignId, req.user.id, status, budgetMinor, dailyCapImpressions]
      );
      res.status(200).json(updated.rows[0]);
    })
  );

  router.get(
    "/campaigns/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const rows = await db.query(
        `SELECT ac.*, acr.status AS review_status, acr.notes AS review_notes, acr.reviewed_at
         FROM ad_campaigns ac
         LEFT JOIN ad_creative_reviews acr ON acr.campaign_id = ac.id
         WHERE ac.creator_user_id = $1
         ORDER BY ac.created_at DESC, ac.id DESC`,
        [req.user.id]
      );
      res.status(200).json({ items: rows.rows });
    })
  );

  async function ingestAdEvent({ campaignId, eventType, viewerUserId, metadata }) {
    const spendPerEvent = eventType === "click" ? 5 : 1;
    await db.query("BEGIN");
    try {
      const campaignResult = await db.query(
        `SELECT ac.id, ac.status, ac.currency, ac.budget_minor, ac.spent_minor,
                acr.status AS review_status
         FROM ad_campaigns ac
         LEFT JOIN ad_creative_reviews acr ON acr.campaign_id = ac.id
         WHERE ac.id = $1
         FOR UPDATE`,
        [campaignId]
      );
      if (campaignResult.rowCount === 0) {
        throw httpError(404, "Campaign not found");
      }
      const campaign = campaignResult.rows[0];
      if (
        campaign.status !== "active" ||
        campaign.review_status !== "approved" ||
        Number(campaign.spent_minor) + spendPerEvent > Number(campaign.budget_minor)
      ) {
        throw httpError(409, "Campaign not eligible for delivery");
      }
      const eventResult = await db.query(
        `INSERT INTO ad_events (campaign_id, event_type, viewer_user_id, metadata)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING id`,
        [campaignId, eventType, viewerUserId || null, JSON.stringify(metadata || {})]
      );
      await db.query(
        `INSERT INTO ad_spend_ledger (campaign_id, event_id, amount_minor, currency, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          campaignId,
          eventResult.rows[0].id,
          spendPerEvent,
          campaign.currency,
          eventType === "click" ? "ad click cost" : "ad impression cost"
        ]
      );
      await db.query(
        `UPDATE ad_campaigns
         SET spent_minor = spent_minor + $2,
             status = CASE WHEN spent_minor + $2 >= budget_minor THEN 'ended' ELSE status END,
             updated_at = NOW()
         WHERE id = $1`,
        [campaignId, spendPerEvent]
      );
      await db.query("COMMIT");
      return { spendPerEvent };
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }

  router.post(
    "/events/impression",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const campaignId = Number(req.body?.campaignId);
      if (!campaignId) {
        throw httpError(400, "campaignId must be a number");
      }
      const result = await ingestAdEvent({
        campaignId,
        eventType: "impression",
        viewerUserId: req.user.id,
        metadata: req.body?.metadata || {}
      });
      if (analytics) {
        await analytics.trackEvent("ad_impression", {
          userId: req.user.id,
          campaignId
        });
      }
      res.status(201).json({ ok: true, campaignId, spendMinor: result.spendPerEvent });
    })
  );

  router.post(
    "/events/click",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const campaignId = Number(req.body?.campaignId);
      const destinationUrl = requireString(req.body?.destinationUrl, "destinationUrl", 8, 2000);
      if (!campaignId) {
        throw httpError(400, "campaignId must be a number");
      }
      const result = await ingestAdEvent({
        campaignId,
        eventType: "click",
        viewerUserId: req.user.id,
        metadata: { destinationUrl }
      });
      if (analytics) {
        await analytics.trackEvent("ad_click", {
          userId: req.user.id,
          campaignId
        });
      }
      res.status(201).json({ ok: true, campaignId, spendMinor: result.spendPerEvent });
    })
  );

  return router;
}

module.exports = {
  createAdsRouter
};
