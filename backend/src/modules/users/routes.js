const crypto = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const { authenticate, authenticateOptional } = require("../../middleware/auth");
const { requireAccessSecret } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { resolveProfilePutFields } = require("../../utils/profile-put");
const { throwIfAnyUserFacingPolicyViolation } = require("../../utils/content-safety");
const { optionalString, requireString } = require("../../utils/validators");
const { getPrayerSettings, updatePrayerSettings } = require("../../services/prayer-settings");
const { resolvePersonaCapabilities } = require("../../services/persona-capabilities");
const { resolvePostAuthorUserId } = require("../../services/anonymous-posting-user");
const INTEREST_KEYS = new Set(["post", "marketplace", "reel"]);
const FEED_TAB_PREFS = new Set(["for_you", "marketplace"]);
const APP_LANDING_PREFS = new Set(["home", "marketplace"]);
const ONBOARDING_INTENT_KEYS = new Set(["community", "shop", "sell", "b2b"]);
const PROFILE_KINDS = new Set(["consumer", "professional", "business_interest"]);
const USAGE_PERSONAS = new Set(["personal", "professional", "business"]);
const USAGE_PERSONA_CONFLICT_KEYS = new Set([
  "defaultFeedTab",
  "appLanding",
  "onboardingIntents",
  "profileKind",
  "businessOnboardingStep",
  "businessOnboardingDismissed"
]);
/** Without auth, PATCH /me/preferences may only include these keys (onboarding continuation). */
const ANONYMOUS_PREFERENCE_BODY_KEYS = new Set([
  "onboardingIntents",
  "defaultFeedTab",
  "appLanding",
  "businessOnboardingDismissed",
  "preferenceSource"
]);

function assertAnonymousPreferencesBody(body) {
  const raw = body && typeof body === "object" ? body : {};
  for (const key of Object.keys(raw)) {
    if (!ANONYMOUS_PREFERENCE_BODY_KEYS.has(key)) {
      throw httpError(401, "Sign in to update these preferences");
    }
  }
}

/**
 * If the client sent Authorization but optional auth did not attach a user, the token is missing,
 * expired, or invalid. Do not fall through to anonymous/guest handling (misleading errors and
 * wrong profile updates). Clients can refresh the access token and retry.
 */
function rejectBearerWithoutResolvedUser(req) {
  const authHeader = req.headers.authorization || "";
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
  if (token && !req.user) {
    throw httpError(401, "Session expired or invalid. Please sign in again.");
  }
}

const USAGE_PERSONA_BUNDLES = {
  personal: {
    profileKind: "consumer",
    onboardingIntents: ["community", "shop"],
    defaultFeedTab: "for_you",
    appLanding: "home",
    businessOnboardingStep: 0
  },
  professional: {
    profileKind: "professional",
    onboardingIntents: ["community", "b2b"],
    defaultFeedTab: "for_you",
    appLanding: "home",
    businessOnboardingStep: 1
  },
  business: {
    profileKind: "business_interest",
    onboardingIntents: ["sell", "shop", "community"],
    defaultFeedTab: "for_you",
    appLanding: "home",
    businessOnboardingStep: 2
  }
};
const PROFILE_BASE_SELECT = `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url, p.business_offering, p.website_url, p.is_verified,
                p.show_business_on_profile, p.default_feed_tab, p.app_landing, p.onboarding_intents, p.seller_checklist_completed_at,
                p.profile_kind, p.business_onboarding_step, p.business_onboarding_dismissed_at,
                p.professional_setup_completed_at, p.business_tools_unlocked_at,
                p.created_at, p.updated_at
         FROM profiles p
         JOIN users u ON u.id = p.user_id`;

function createUsersRouter({ db, config, analytics }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });
  const optionalAuthMiddleware = authenticateOptional({ config, db });

  function buildAnonymousMePayload() {
    const profile = {
      user_id: null,
      username: "",
      display_name: "",
      bio: null,
      avatar_url: null,
      business_offering: null,
      website_url: null,
      is_verified: false,
      show_business_on_profile: false,
      default_feed_tab: "for_you",
      app_landing: "home",
      onboarding_intents: [],
      seller_checklist_completed_at: null,
      profile_kind: "consumer",
      business_onboarding_step: 0,
      business_onboarding_dismissed_at: null,
      professional_setup_completed_at: null,
      business_tools_unlocked_at: null,
      created_at: null,
      updated_at: null
    };
    return {
      ...profile,
      persona_capabilities: resolvePersonaCapabilities(profile),
      posts_count: 0,
      followers_count: 0,
      following_count: 0,
      likes_received_count: 0,
      likes_given_count: 0,
      is_following: false
    };
  }

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

  async function getMeProfileRow(userId) {
    const result = await db.query(
      `${PROFILE_BASE_SELECT}
         WHERE p.user_id = $1
         LIMIT 1`,
      [userId]
    );
    if (result.rowCount === 0) {
      throw httpError(404, "User profile not found");
    }
    return result.rows[0];
  }

  async function buildMePayload(userId) {
    const profile = await getMeProfileRow(userId);
    const stats = await getProfileStats({ userId, viewerId: userId });
    return {
      ...profile,
      persona_capabilities: resolvePersonaCapabilities(profile),
      ...stats
    };
  }

  router.get(
    "/me",
    optionalAuthMiddleware,
    asyncHandler(async (req, res) => {
      if (!req.user) {
        res.status(200).json(buildAnonymousMePayload());
        return;
      }
      const payload = await buildMePayload(req.user.id);
      res.status(200).json(payload);
    })
  );

  router.patch(
    "/me/preferences",
    optionalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      rejectBearerWithoutResolvedUser(req);
      if (!req.user) {
        assertAnonymousPreferencesBody(body);
      }
      const preferenceUserId = await resolvePostAuthorUserId(req, db, config);
      const previousProfile = await getMeProfileRow(preferenceUserId);
      const sets = [];
      const vals = [];
      let i = 1;
      const preferenceSource = optionalString(body.preferenceSource, "preferenceSource", 40) || "unknown";
      let usagePersonaSelected = null;

      if (Object.prototype.hasOwnProperty.call(body, "usagePersona")) {
        const persona = String(body.usagePersona || "").trim();
        if (!USAGE_PERSONAS.has(persona)) {
          throw httpError(400, "usagePersona must be personal, professional, or business");
        }
        const hasConflicts = [...USAGE_PERSONA_CONFLICT_KEYS].some((key) =>
          Object.prototype.hasOwnProperty.call(body, key)
        );
        if (hasConflicts) {
          throw httpError(
            400,
            "usagePersona cannot be combined with defaultFeedTab, appLanding, onboardingIntents, profileKind, businessOnboardingStep, or businessOnboardingDismissed"
          );
        }
        const bundle = USAGE_PERSONA_BUNDLES[persona];
        usagePersonaSelected = persona;
        sets.push(`profile_kind = $${i}`);
        vals.push(bundle.profileKind);
        i += 1;
        sets.push(`onboarding_intents = $${i}::text[]`);
        vals.push(bundle.onboardingIntents);
        i += 1;
        sets.push(`default_feed_tab = $${i}`);
        vals.push(bundle.defaultFeedTab);
        i += 1;
        sets.push(`app_landing = $${i}`);
        vals.push(bundle.appLanding);
        i += 1;
        sets.push(`business_onboarding_step = $${i}`);
        vals.push(bundle.businessOnboardingStep);
        i += 1;
        sets.push("business_onboarding_dismissed_at = COALESCE(business_onboarding_dismissed_at, NOW())");
        if (persona === "professional") {
          sets.push("professional_setup_completed_at = COALESCE(professional_setup_completed_at, NOW())");
        }
        if (persona === "business") {
          sets.push("business_tools_unlocked_at = COALESCE(business_tools_unlocked_at, NOW())");
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, "defaultFeedTab")) {
        const v = body.defaultFeedTab;
        if (v === null || v === "") {
          sets.push("default_feed_tab = NULL");
        } else {
          const raw = String(v).trim();
          const t = raw === "opportunities" ? "for_you" : raw;
          if (!FEED_TAB_PREFS.has(t)) {
            throw httpError(400, "defaultFeedTab must be for_you or marketplace");
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
        sets.push("business_tools_unlocked_at = COALESCE(business_tools_unlocked_at, NOW())");
      }

      if (Object.prototype.hasOwnProperty.call(body, "profileKind")) {
        const t = String(body.profileKind || "").trim();
        if (!PROFILE_KINDS.has(t)) {
          throw httpError(400, "profileKind must be consumer, professional, or business_interest");
        }
        sets.push(`profile_kind = $${i}`);
        vals.push(t);
        i += 1;
        if (t === "professional") {
          sets.push("professional_setup_completed_at = COALESCE(professional_setup_completed_at, NOW())");
        }
        if (t === "business_interest") {
          sets.push("business_tools_unlocked_at = COALESCE(business_tools_unlocked_at, NOW())");
        }
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

      // One assignment only: PG rejects duplicate SET targets (e.g. onboarding + explicit dismiss flag).
      if (
        Object.prototype.hasOwnProperty.call(body, "onboardingIntents") ||
        body.businessOnboardingDismissed === true
      ) {
        sets.push("business_onboarding_dismissed_at = COALESCE(business_onboarding_dismissed_at, NOW())");
      }

      if (sets.length === 0) {
        throw httpError(400, "No valid preference fields to update");
      }

      sets.push("updated_at = NOW()");
      vals.push(preferenceUserId);

      const updateResult = await db.query(
        `UPDATE profiles SET ${sets.join(", ")} WHERE user_id = $${i} RETURNING user_id`,
        vals
      );
      if (updateResult.rowCount === 0) {
        throw httpError(404, "User profile not found");
      }

      const payload = await buildMePayload(preferenceUserId);
      if (analytics) {
        if (usagePersonaSelected) {
          await analytics.trackEvent("usage_persona_selected", {
            userId: preferenceUserId,
            usagePersona: usagePersonaSelected,
            source: preferenceSource
          });
        }
        if (previousProfile.profile_kind !== payload.profile_kind) {
          await analytics.trackEvent("profile_kind_changed", {
            userId: preferenceUserId,
            from: previousProfile.profile_kind,
            to: payload.profile_kind,
            source: preferenceSource
          });
        }
        if (
          !previousProfile.professional_setup_completed_at &&
          payload.professional_setup_completed_at &&
          payload.profile_kind === "professional"
        ) {
          await analytics.trackEvent("professional_setup_completed", {
            userId: preferenceUserId,
            source: preferenceSource
          });
        }
        if (!previousProfile.business_tools_unlocked_at && payload.business_tools_unlocked_at) {
          await analytics.trackEvent("business_tools_unlocked", {
            userId: preferenceUserId,
            source: preferenceSource,
            profileKind: payload.profile_kind
          });
        }
      }
      res.status(200).json(payload);
    })
  );

  router.get(
    "/me/interests",
    optionalAuthMiddleware,
    asyncHandler(async (req, res) => {
      rejectBearerWithoutResolvedUser(req);
      const interestViewerId = await resolvePostAuthorUserId(req, db, config);
      const result = await db.query(
        `SELECT interest_key, created_at
         FROM user_interests
         WHERE user_id = $1
         ORDER BY created_at ASC`,
        [interestViewerId]
      );

      res.status(200).json({
        items: result.rows.map((row) => row.interest_key)
      });
    })
  );

  router.put(
    "/me/interests",
    optionalAuthMiddleware,
    asyncHandler(async (req, res) => {
      rejectBearerWithoutResolvedUser(req);
      const interests = Array.isArray(req.body?.interests) ? req.body.interests : [];
      const normalized = interests
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .filter((entry) => INTEREST_KEYS.has(entry));

      const interestUserId = await resolvePostAuthorUserId(req, db, config);

      await db.query("DELETE FROM user_interests WHERE user_id = $1", [interestUserId]);
      for (const interestKey of [...new Set(normalized)]) {
        await db.query(
          `INSERT INTO user_interests (user_id, interest_key)
           VALUES ($1, $2)`,
          [interestUserId, interestKey]
        );
      }

      res.status(200).json({
        items: [...new Set(normalized)]
      });
    })
  );

  router.get(
    "/me/sessions",
    optionalAuthMiddleware,
    asyncHandler(async (req, res) => {
      if (!req.user) {
        res.status(200).json({ items: [] });
        return;
      }
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

      throwIfAnyUserFacingPolicyViolation(
        [displayName, bio, avatarUrl, businessOffering, websiteUrl],
        config,
        {
          termMessage: "Profile contains blocked language",
          urlMessage: "Profile links to a blocked website"
        }
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

      const payload = await buildMePayload(req.user.id);
      res.status(200).json(payload);
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
    "/me/data-export",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const userId = req.user.id;
      const userRow = await db.query(
        `SELECT id, email, username, role, is_active, created_at, updated_at
         FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      if (userRow.rowCount === 0) {
        throw httpError(404, "User not found");
      }
      const profileRow = await db.query(
        `SELECT display_name, bio, avatar_url, business_offering, website_url, profile_kind,
                default_feed_tab, app_landing, onboarding_intents, created_at, updated_at
         FROM profiles WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      const postsRow = await db.query(
        `SELECT id, post_type, content, visibility_status, created_at, updated_at
         FROM posts
         WHERE author_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 200`,
        [userId]
      );
      const ordersRow = await db.query(
        `SELECT id AS order_id, kind, status, amount_minor, currency, seller_user_id, product_id, created_at
         FROM orders
         WHERE buyer_user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 200`,
        [userId]
      );
      res.status(200).json({
        exportedAt: new Date().toISOString(),
        user: userRow.rows[0],
        profile: profileRow.rows[0] || null,
        posts: postsRow.rows,
        purchases: ordersRow.rows,
        disclaimer:
          "This export contains the personal data we store for your account at export time. It may not include every derived or operational log; contact support for additional requests."
      });
    })
  );

  router.delete(
    "/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const userId = req.user.id;
      const confirm = requireString(req.body?.confirm, "confirm", 6, 32);
      if (confirm !== "DELETE") {
        throw httpError(400, 'To delete your account, send JSON body { "confirm": "DELETE" }.');
      }
      const roleResult = await db.query(`SELECT role FROM users WHERE id = $1 LIMIT 1`, [userId]);
      if (roleResult.rowCount === 0) {
        throw httpError(404, "User not found");
      }
      const role = roleResult.rows[0].role;
      if (role !== "user") {
        throw httpError(403, "Staff accounts cannot be closed from the app. Contact operations.");
      }

      const pool = db.pool;
      if (!pool) {
        throw httpError(503, "Database is not configured");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM notification_device_tokens WHERE user_id = $1`, [userId]);
        const anonEmail = `deleted.${userId}.${Date.now()}@users.deleted.local`.slice(0, 254);
        const placeholderHash = crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
        const newUsername = `del_${userId}`;
        await client.query(
          `UPDATE users
           SET email = $2,
               username = $3,
               password_hash = $4,
               is_active = false,
               updated_at = NOW()
           WHERE id = $1`,
          [userId, anonEmail, newUsername, placeholderHash]
        );
        await client.query(
          `UPDATE profiles
           SET display_name = $2,
               bio = NULL,
               avatar_url = NULL,
               business_offering = NULL,
               website_url = NULL,
               updated_at = NOW()
           WHERE user_id = $1`,
          [userId, "Former user"]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      if (analytics) {
        await analytics.trackEvent("account_closed_self_serve", { userId });
      }
      res.status(204).end();
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
