const express = require("express");
const jwt = require("jsonwebtoken");
const { authenticate } = require("../../middleware/auth");
const { requireAccessSecret } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { resolveProfilePutFields } = require("../../utils/profile-put");
const { getPrayerSettings, updatePrayerSettings } = require("../../services/prayer-settings");
const INTEREST_KEYS = new Set(["post", "marketplace", "reel"]);
const FEED_TAB_PREFS = new Set(["for_you", "opportunities", "marketplace"]);
const APP_LANDING_PREFS = new Set(["home", "marketplace"]);
const ONBOARDING_INTENT_KEYS = new Set(["community", "shop", "sell", "b2b"]);
const PROFILE_KINDS = new Set(["consumer", "business_interest"]);

function createUsersRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  async function getViewerIdFromAuthHeader(authorization) {
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return null;
    }
    const token = authorization.slice("Bearer ".length);
    if (!token) {
      return null;
    }
    try {
      const payload = jwt.verify(token, requireAccessSecret(config));
      const userId = Number(payload.sub);
      if (!userId) {
        return null;
      }
      const result = await db.query(
        "SELECT id FROM users WHERE id = $1 AND is_active = true LIMIT 1",
        [userId]
      );
      return result.rowCount > 0 ? result.rows[0].id : null;
    } catch {
      return null;
    }
  }

  async function getProfileStats({ userId, viewerId }) {
    const result = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM posts p WHERE p.author_id = $1 AND p.visibility_status = 'visible') AS posts_count,
         (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = $1) AS followers_count,
         (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = $1) AS following_count,
         (
           SELECT COUNT(*)::int
           FROM interactions i
           JOIN posts p ON p.id = i.post_id
           WHERE p.author_id = $1
             AND i.interaction_type = 'benefited'
         ) AS likes_received_count,
         (
           SELECT COUNT(*)::int
           FROM interactions i
           WHERE i.user_id = $1
             AND i.interaction_type = 'benefited'
         ) AS likes_given_count,
         CASE
           WHEN $2::int IS NULL THEN false
           ELSE EXISTS (
             SELECT 1
             FROM follows f
             WHERE f.follower_id = $2
               AND f.following_id = $1
           )
         END AS is_following`,
      [userId, viewerId]
    );
    return result.rows[0];
  }

  router.get(
    "/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url, p.business_offering, p.website_url, p.is_verified,
                p.show_business_on_profile, p.default_feed_tab, p.app_landing, p.onboarding_intents, p.seller_checklist_completed_at,
                p.profile_kind, p.business_onboarding_step, p.business_onboarding_dismissed_at,
                p.created_at, p.updated_at
         FROM profiles p
         JOIN users u ON u.id = p.user_id
         WHERE p.user_id = $1
         LIMIT 1`,
        [req.user.id]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "User profile not found");
      }
      const stats = await getProfileStats({ userId: req.user.id, viewerId: req.user.id });
      res.status(200).json({
        ...result.rows[0],
        ...stats
      });
    })
  );

  router.patch(
    "/me/preferences",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      const sets = [];
      const vals = [];
      let i = 1;

      if (Object.prototype.hasOwnProperty.call(body, "defaultFeedTab")) {
        const v = body.defaultFeedTab;
        if (v === null || v === "") {
          sets.push("default_feed_tab = NULL");
        } else {
          const t = String(v).trim();
          if (!FEED_TAB_PREFS.has(t)) {
            throw httpError(400, "defaultFeedTab must be for_you, opportunities, or marketplace");
          }
          sets.push(`default_feed_tab = $${i}`);
          vals.push(t);
          i += 1;
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, "appLanding")) {
        const v = body.appLanding;
        if (v === null || v === "") {
          sets.push("app_landing = NULL");
        } else {
          const t = String(v).trim();
          if (!APP_LANDING_PREFS.has(t)) {
            throw httpError(400, "appLanding must be home or marketplace");
          }
          sets.push(`app_landing = $${i}`);
          vals.push(t);
          i += 1;
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, "showBusinessOnProfile")) {
        sets.push(`show_business_on_profile = $${i}`);
        vals.push(Boolean(body.showBusinessOnProfile));
        i += 1;
      }

      if (Object.prototype.hasOwnProperty.call(body, "onboardingIntents")) {
        const raw = Array.isArray(body.onboardingIntents) ? body.onboardingIntents : [];
        const normalized = [
          ...new Set(
            raw
              .map((entry) => String(entry || "").trim())
              .filter(Boolean)
              .filter((key) => ONBOARDING_INTENT_KEYS.has(key))
          )
        ].slice(0, 6);
        sets.push(`onboarding_intents = $${i}::text[]`);
        vals.push(normalized);
        i += 1;
      }

      if (body.sellerChecklistCompleted === true) {
        sets.push("seller_checklist_completed_at = COALESCE(seller_checklist_completed_at, NOW())");
      }

      if (Object.prototype.hasOwnProperty.call(body, "profileKind")) {
        const t = String(body.profileKind || "").trim();
        if (!PROFILE_KINDS.has(t)) {
          throw httpError(400, "profileKind must be consumer or business_interest");
        }
        sets.push(`profile_kind = $${i}`);
        vals.push(t);
        i += 1;
      }

      if (Object.prototype.hasOwnProperty.call(body, "businessOnboardingStep")) {
        const step = Number(body.businessOnboardingStep);
        if (!Number.isInteger(step) || step < 0 || step > 5) {
          throw httpError(400, "businessOnboardingStep must be an integer 0–5");
        }
        sets.push(`business_onboarding_step = $${i}`);
        vals.push(step);
        i += 1;
      }

      if (body.businessOnboardingDismissed === true) {
        sets.push("business_onboarding_dismissed_at = COALESCE(business_onboarding_dismissed_at, NOW())");
      }

      if (sets.length === 0) {
        throw httpError(400, "No valid preference fields to update");
      }

      sets.push("updated_at = NOW()");
      vals.push(req.user.id);

      const updateResult = await db.query(
        `UPDATE profiles SET ${sets.join(", ")} WHERE user_id = $${i} RETURNING user_id`,
        vals
      );
      if (updateResult.rowCount === 0) {
        throw httpError(404, "User profile not found");
      }

      const result = await db.query(
        `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url, p.business_offering, p.website_url, p.is_verified,
                p.show_business_on_profile, p.default_feed_tab, p.app_landing, p.onboarding_intents, p.seller_checklist_completed_at,
                p.profile_kind, p.business_onboarding_step, p.business_onboarding_dismissed_at,
                p.created_at, p.updated_at
         FROM profiles p
         JOIN users u ON u.id = p.user_id
         WHERE p.user_id = $1
         LIMIT 1`,
        [req.user.id]
      );
      const stats = await getProfileStats({ userId: req.user.id, viewerId: req.user.id });
      res.status(200).json({
        ...result.rows[0],
        ...stats
      });
    })
  );

  router.get(
    "/me/interests",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT interest_key, created_at
         FROM user_interests
         WHERE user_id = $1
         ORDER BY created_at ASC`,
        [req.user.id]
      );

      res.status(200).json({
        items: result.rows.map((row) => row.interest_key)
      });
    })
  );

  router.put(
    "/me/interests",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const interests = Array.isArray(req.body?.interests) ? req.body.interests : [];
      const normalized = interests
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .filter((entry) => INTEREST_KEYS.has(entry));

      await db.query("DELETE FROM user_interests WHERE user_id = $1", [req.user.id]);
      for (const interestKey of [...new Set(normalized)]) {
        await db.query(
          `INSERT INTO user_interests (user_id, interest_key)
           VALUES ($1, $2)`,
          [req.user.id, interestKey]
        );
      }

      res.status(200).json({
        items: [...new Set(normalized)]
      });
    })
  );

  router.get(
    "/me/sessions",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT id, user_id, expires_at, revoked_at, created_at
         FROM refresh_tokens
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [req.user.id]
      );
      res.status(200).json({ items: result.rows });
    })
  );

  router.post(
    "/me/sessions/:sessionId/revoke",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const sessionId = Number(req.params.sessionId);
      if (!sessionId) {
        throw httpError(400, "sessionId must be a number");
      }
      const result = await db.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE id = $1
           AND user_id = $2
         RETURNING id, revoked_at`,
        [sessionId, req.user.id]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "Session not found");
      }
      res.status(200).json(result.rows[0]);
    })
  );

  router.put(
    "/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const existing = await db.query(
        `SELECT display_name, bio, avatar_url, business_offering, website_url
         FROM profiles WHERE user_id = $1 LIMIT 1`,
        [req.user.id]
      );
      if (existing.rowCount === 0) {
        throw httpError(404, "User profile not found");
      }
      const { displayName, bio, avatarUrl, businessOffering, websiteUrl } = resolveProfilePutFields(
        req.body,
        existing.rows[0]
      );

      const updateResult = await db.query(
        `UPDATE profiles p
         SET display_name = $1, bio = $2, avatar_url = $3, business_offering = $4, website_url = $5, updated_at = NOW()
         FROM users u
         WHERE p.user_id = $6
           AND u.id = p.user_id
         RETURNING p.user_id`,
        [displayName, bio, avatarUrl, businessOffering, websiteUrl, req.user.id]
      );

      if (updateResult.rowCount === 0) {
        throw httpError(404, "User profile not found");
      }

      const result = await db.query(
        `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url, p.business_offering, p.website_url, p.is_verified,
                p.show_business_on_profile, p.default_feed_tab, p.app_landing, p.onboarding_intents, p.seller_checklist_completed_at,
                p.profile_kind, p.business_onboarding_step, p.business_onboarding_dismissed_at,
                p.created_at, p.updated_at
         FROM profiles p
         JOIN users u ON u.id = p.user_id
         WHERE p.user_id = $1
         LIMIT 1`,
        [req.user.id]
      );
      const stats = await getProfileStats({ userId: req.user.id, viewerId: req.user.id });
      res.status(200).json({
        ...result.rows[0],
        ...stats
      });
    })
  );

  router.get(
    "/me/prayer-settings",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const settings = await getPrayerSettings(db, req.user.id);
      res.status(200).json(settings);
    })
  );

  router.put(
    "/me/prayer-settings",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const settings = await updatePrayerSettings(db, req.user.id, req.body || {});
      res.status(200).json(settings);
    })
  );

  router.get(
    "/:userId",
    asyncHandler(async (req, res) => {
      const userId = Number(req.params.userId);
      if (!userId) {
        throw httpError(400, "userId must be a number");
      }

      const result = await db.query(
        `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url, p.business_offering, p.website_url, p.is_verified,
                p.show_business_on_profile, p.created_at, p.updated_at
         FROM profiles p
         JOIN users u ON u.id = p.user_id
         WHERE p.user_id = $1
         LIMIT 1`,
        [userId]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "User not found");
      }
      const viewerId = await getViewerIdFromAuthHeader(req.headers.authorization);
      const stats = await getProfileStats({ userId, viewerId });
      const row = result.rows[0];
      const payload = { ...row };
      delete payload.show_business_on_profile;
      if (viewerId !== userId && !row.show_business_on_profile) {
        payload.business_offering = null;
        payload.website_url = null;
      }
      res.status(200).json({
        ...payload,
        ...stats
      });
    })
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const search = (req.query.search || "").toString().trim();

      const result = await db.query(
        `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url,
                CASE WHEN p.show_business_on_profile THEN p.business_offering ELSE NULL END AS business_offering,
                CASE WHEN p.show_business_on_profile THEN p.website_url ELSE NULL END AS website_url,
                p.is_verified, p.created_at, p.updated_at
         FROM profiles p
         JOIN users u ON u.id = p.user_id
         WHERE ($1::text = '' OR p.display_name ILIKE ('%' || $1 || '%') OR u.username ILIKE ('%' || $1 || '%'))
         ORDER BY p.display_name ASC, p.user_id ASC
         LIMIT $2 OFFSET $3`,
        [search, limit, offset]
      );

      res.status(200).json({
        limit,
        offset,
        items: result.rows
      });
    })
  );

  return router;
}

module.exports = {
  createUsersRouter
};
