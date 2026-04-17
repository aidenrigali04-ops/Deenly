const express = require("express");
const rateLimit = require("express-rate-limit");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { optionalString, requireString } = require("../../utils/validators");
const { listBoostPackages, getBoostPackageById } = require("../../config/boost-catalog");
const {
  normalizeBoostCheckoutReturnClient,
  resolveAdBoostStripeReturnUrls
} = require("../../utils/boost-checkout-return");
const { getTrustSignalThresholds } = require("../trust/trust-signal-thresholds");

const CAMPAIGN_STATUSES = new Set(["draft", "active", "paused", "ended"]);

function normalizeCurrency(value) {
  return String(value || "usd")
    .trim()
    .toLowerCase()
    .slice(0, 3);
}

function createAdsRouter({ db, config, analytics, monetizationGateway, trustFlagService = null }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  const skipAdsUserRateLimits = () => Boolean(config.isTest);
  const adsCampaignCreateLimiter = rateLimit({
    windowMs: config.adsCampaignCreateRateLimitWindowMs,
    limit: config.adsCampaignCreateRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipAdsUserRateLimits,
    keyGenerator(req) {
      return req.user?.id ? `ads-campaign-create:${req.user.id}` : req.ip;
    }
  });
  const adsBoostCheckoutLimiter = rateLimit({
    windowMs: config.adsBoostCheckoutRateLimitWindowMs,
    limit: config.adsBoostCheckoutRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipAdsUserRateLimits,
    keyGenerator(req) {
      return req.user?.id ? `ads-boost-checkout:${req.user.id}` : req.ip;
    }
  });

  router.get(
    "/boost-catalog",
    asyncHandler(async (_req, res) => {
      res.status(200).json({ items: listBoostPackages() });
    })
  );

  router.post(
    "/campaigns",
    authMiddleware,
    adsCampaignCreateLimiter,
    asyncHandler(async (req, res) => {
      const postIdRaw = req.body?.postId;
      const eventIdRaw = req.body?.eventId;
      const postId =
        postIdRaw !== undefined && postIdRaw !== null && String(postIdRaw).trim() !== ""
          ? Number(postIdRaw)
          : null;
      const eventId =
        eventIdRaw !== undefined && eventIdRaw !== null && String(eventIdRaw).trim() !== ""
          ? Number(eventIdRaw)
          : null;

      if ((!postId || !Number.isInteger(postId)) && (!eventId || !Number.isInteger(eventId))) {
        throw httpError(400, "postId or eventId is required");
      }
      if (postId && eventId) {
        throw httpError(400, "Provide only one of postId or eventId");
      }

      const packageId = optionalString(req.body?.packageId, "packageId", 64);
      const pkg = packageId ? getBoostPackageById(packageId) : null;
      if (packageId && !pkg) {
        throw httpError(400, "Unknown packageId");
      }

      let budgetMinor =
        req.body?.budgetMinor !== undefined && req.body?.budgetMinor !== null
          ? Number(req.body.budgetMinor)
          : NaN;
      if (!Number.isInteger(budgetMinor) || budgetMinor <= 0) {
        if (pkg) {
          budgetMinor = pkg.suggestedBudgetMinor;
        }
      }
      if (!Number.isInteger(budgetMinor) || budgetMinor <= 0) {
        throw httpError(400, "budgetMinor must be a positive integer");
      }

      const currency = normalizeCurrency(pkg?.currency || req.body?.currency || "usd");
      let dailyCapImpressions;
      if (req.body?.dailyCapImpressions !== undefined && req.body?.dailyCapImpressions !== null) {
        dailyCapImpressions = Math.min(Math.max(Number(req.body.dailyCapImpressions), 100), 100000);
        if (!Number.isFinite(dailyCapImpressions)) {
          throw httpError(400, "dailyCapImpressions must be a number");
        }
      } else if (pkg) {
        dailyCapImpressions = Math.min(Math.max(Number(pkg.dailyCapImpressions), 100), 100000);
      } else {
        dailyCapImpressions = Math.min(Math.max(Number(req.body?.dailyCapImpressions) || 1000, 100), 100000);
      }

      const startsAt = optionalString(req.body?.startsAt, "startsAt", 64) || null;
      const endsAt = optionalString(req.body?.endsAt, "endsAt", 64) || null;

      if (postId) {
        const ownerCheck = await db.query(
          `SELECT id FROM posts WHERE id = $1 AND author_id = $2 LIMIT 1`,
          [postId, req.user.id]
        );
        if (ownerCheck.rowCount === 0) {
          throw httpError(404, "Post not found");
        }
      } else {
        const ownerCheck = await db.query(
          `SELECT id FROM events WHERE id = $1 AND host_user_id = $2 AND status = 'scheduled' LIMIT 1`,
          [eventId, req.user.id]
        );
        if (ownerCheck.rowCount === 0) {
          throw httpError(404, "Event not found");
        }
      }

      const created = await db.query(
        `INSERT INTO ad_campaigns (
           creator_user_id, post_id, event_id, status, budget_minor, spent_minor, currency, daily_cap_impressions, starts_at, ends_at
         )
         VALUES ($1, $2, $3, 'draft', $4, 0, $5, $6, $7::timestamptz, $8::timestamptz)
         RETURNING *`,
        [req.user.id, postId || null, eventId || null, budgetMinor, currency, dailyCapImpressions, startsAt, endsAt]
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
          postId: postId || undefined,
          eventId: eventId || undefined,
          packageId: packageId || undefined
        });
      }
      const thr = getTrustSignalThresholds(config);
      if (
        trustFlagService &&
        typeof trustFlagService.recordFlag === "function" &&
        thr.enabled &&
        budgetMinor >= thr.boostBudgetFlagMinor &&
        thr.boostBudgetFlagMinor > 0
      ) {
        await trustFlagService.recordFlag(config, {
          domain: "boost",
          flagType: "boost_high_draft_budget",
          severity: "low",
          subjectUserId: req.user.id,
          relatedEntityType: "ad_campaign",
          relatedEntityId: String(created.rows[0].id),
          metadata: { budgetMinor, currency }
        });
      }
      res.status(201).json(created.rows[0]);
    })
  );

  router.post(
    "/campaigns/:id/boost-checkout",
    authMiddleware,
    adsBoostCheckoutLimiter,
    asyncHandler(async (req, res) => {
      if (!monetizationGateway || typeof monetizationGateway.createCheckoutSession !== "function") {
        throw httpError(503, "Checkout is not available");
      }
      const campaignId = Number(req.params.id);
      if (!campaignId) {
        throw httpError(400, "campaign id must be a number");
      }
      const campResult = await db.query(
        `SELECT * FROM ad_campaigns WHERE id = $1 AND creator_user_id = $2 LIMIT 1`,
        [campaignId, req.user.id]
      );
      if (campResult.rowCount === 0) {
        throw httpError(404, "Campaign not found");
      }
      const camp = campResult.rows[0];
      if (camp.boost_funded_at) {
        throw httpError(409, "Boost budget is already funded");
      }
      const returnClient = normalizeBoostCheckoutReturnClient(req.body?.returnClient);
      if (returnClient == null) {
        throw httpError(400, "returnClient must be web or mobile_app");
      }
      const { successUrl, cancelUrl } = resolveAdBoostStripeReturnUrls({
        appBaseUrl: config?.appBaseUrl,
        campaignId,
        returnClient
      });
      const session = await monetizationGateway.createCheckoutSession({
        kind: "ad_boost",
        mode: "payment",
        amountMinor: Number(camp.budget_minor),
        currency: camp.currency,
        buyerUserId: req.user.id,
        sellerUserId: req.user.id,
        title: "Boost campaign budget",
        description: `Ad campaign #${campaignId}`,
        metadataExtra: { adCampaignId: String(campaignId) },
        successUrl,
        cancelUrl
      });
      res.status(200).json({ url: session.url, sessionId: session.id });
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
      if (status === "active" && status !== current.status) {
        const reviewCheck = await db.query(
          `SELECT status FROM ad_creative_reviews WHERE campaign_id = $1 LIMIT 1`,
          [campaignId]
        );
        if (reviewCheck.rows[0]?.status !== "approved") {
          throw httpError(409, "Creative review must be approved before activating");
        }
        if (!current.boost_funded_at) {
          throw httpError(409, "Boost budget must be paid before activating");
        }
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

  router.get(
    "/campaigns/me/analytics-summary",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const agg = await db.query(
        `SELECT
           COUNT(DISTINCT ac.id)::int AS campaign_count,
           COUNT(DISTINCT ac.id) FILTER (WHERE ac.status = 'active')::int AS active_campaigns,
           COALESCE(SUM(CASE WHEN ae.event_type = 'impression' THEN 1 ELSE 0 END), 0)::bigint AS impressions,
           COALESCE(SUM(CASE WHEN ae.event_type = 'click' THEN 1 ELSE 0 END), 0)::bigint AS clicks
         FROM ad_campaigns ac
         LEFT JOIN ad_events ae ON ae.campaign_id = ac.id
         WHERE ac.creator_user_id = $1`,
        [req.user.id]
      );
      const row = agg.rows[0] || {};
      res.status(200).json({
        campaignCount: Number(row.campaign_count) || 0,
        activeCampaigns: Number(row.active_campaigns) || 0,
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0
      });
    })
  );

  router.get(
    "/campaigns/:id/analytics",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const campaignId = Number(req.params.id);
      if (!campaignId) {
        throw httpError(400, "campaign id must be a number");
      }
      const own = await db.query(
        `SELECT id FROM ad_campaigns WHERE id = $1 AND creator_user_id = $2 LIMIT 1`,
        [campaignId, req.user.id]
      );
      if (own.rowCount === 0) {
        throw httpError(404, "Campaign not found");
      }
      const stats = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE event_type = 'impression')::int AS impressions,
           COUNT(*) FILTER (WHERE event_type = 'click')::int AS clicks
         FROM ad_events
         WHERE campaign_id = $1`,
        [campaignId]
      );
      const row = stats.rows[0] || { impressions: 0, clicks: 0 };
      res.status(200).json({
        campaignId,
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0
      });
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
