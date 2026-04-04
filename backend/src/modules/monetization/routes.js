const express = require("express");
const { setImmediate } = require("timers");
const rateLimit = require("express-rate-limit");
const { authenticate, authenticateOptional } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { requireString, optionalString } = require("../../utils/validators");
const { mapStripeProductPriceToDraft } = require("../../services/product-import-stripe-map");
const { importProductDraftFromUrl } = require("../../services/product-import-url");
const { fulfillProductOrderAfterPayment, parseSmsOptIn } = require("../../services/purchase-fulfillment");
const { hashToken } = require("../../services/purchase-access-token");
const { resolvePersonaCapabilities } = require("../../services/persona-capabilities");
const { throwIfAnyUserFacingPolicyViolation } = require("../../utils/content-safety");

function extractCheckoutCustomerContact(sessionObj) {
  const d = sessionObj?.customer_details || {};
  const email = String(d.email || sessionObj?.customer_email || "").trim();
  const phone = String(d.phone || "").trim();
  return { email, phone };
}

const PRODUCT_STATUSES = new Set(["draft", "published", "archived"]);
const PRODUCT_TYPES = new Set(["digital", "service", "subscription"]);
const AUDIENCE_TARGETS = new Set(["b2b", "b2c", "both"]);
const TIER_STATUSES = new Set(["draft", "published", "archived"]);
const SUBSCRIPTION_STATUSES = new Set(["active", "canceled", "past_due", "incomplete", "expired"]);

const BOOST_TIER_BPS = Object.freeze({
  standard: 350,
  boosted: 2000,
  aggressive: 3500
});
const BOOST_TIER_KEYS = new Set(Object.keys(BOOST_TIER_BPS));

function getEnabledBoostTierSet(config) {
  const enabled = new Set(["standard"]);
  if (config.monetizationEnableBoostedTier !== false) {
    enabled.add("boosted");
  }
  if (config.monetizationEnableAggressiveTier === true) {
    enabled.add("aggressive");
  }
  return enabled;
}

function getBoostTierPolicy(config) {
  const enabled = getEnabledBoostTierSet(config);
  return {
    feeExperimentEnabled: Boolean(config.monetizationFeeExperimentEnabled),
    tiers: [
      {
        key: "standard",
        label: "Standard",
        platformFeeBps: BOOST_TIER_BPS.standard,
        enabled: enabled.has("standard"),
        description: "Default distribution placement."
      },
      {
        key: "boosted",
        label: "Boosted",
        platformFeeBps: BOOST_TIER_BPS.boosted,
        enabled: enabled.has("boosted"),
        description: "Higher-priority distribution placement."
      },
      {
        key: "aggressive",
        label: "Aggressive",
        platformFeeBps: BOOST_TIER_BPS.aggressive,
        enabled: enabled.has("aggressive"),
        description: "Maximum distribution exposure (limited rollout)."
      }
    ]
  };
}

function resolveProductPlatformFeeFields(body, previous, config, { isPatch }) {
  const minBps = config.monetizationPlatformFeeBpsMin;
  const maxBps = config.monetizationPlatformFeeBpsMax;
  const enabledTierKeys = getEnabledBoostTierSet(config);
  const hasTierKey = body && Object.prototype.hasOwnProperty.call(body, "boostTier");
  const hasBpsKey = body && Object.prototype.hasOwnProperty.call(body, "platformFeeBps");

  if (isPatch && !hasTierKey && !hasBpsKey) {
    return {
      platformFeeBps: previous.platform_fee_bps,
      boostTier: previous.boost_tier || null
    };
  }

  let tierFromBody;
  if (hasTierKey) {
    const v = body.boostTier;
    if (v === null || v === "") {
      tierFromBody = null;
    } else {
      const t = String(v).trim().toLowerCase();
      if (!BOOST_TIER_KEYS.has(t)) {
        throw httpError(400, "boostTier must be standard, boosted, or aggressive");
      }
      if (!enabledTierKeys.has(t)) {
        throw httpError(400, `${t} boost tier is not available right now`);
      }
      tierFromBody = t;
    }
  }

  let bpsFromBody;
  if (hasBpsKey) {
    const n = Number(body.platformFeeBps);
    if (!Number.isInteger(n) || n < minBps || n > maxBps) {
      throw httpError(400, `platformFeeBps must be an integer from ${minBps} to ${maxBps}`);
    }
    bpsFromBody = n;
  }

  if (tierFromBody !== undefined && bpsFromBody !== undefined) {
    if (tierFromBody !== null && bpsFromBody !== BOOST_TIER_BPS[tierFromBody]) {
      throw httpError(400, "platformFeeBps must match the selected boostTier");
    }
    return { platformFeeBps: bpsFromBody, boostTier: tierFromBody };
  }

  if (tierFromBody !== undefined) {
    if (tierFromBody === null) {
      const bps =
        bpsFromBody !== undefined
          ? bpsFromBody
          : isPatch
            ? previous.platform_fee_bps
            : config.monetizationPlatformFeeBps;
      return { platformFeeBps: bps, boostTier: null };
    }
    return { platformFeeBps: BOOST_TIER_BPS[tierFromBody], boostTier: tierFromBody };
  }

  if (bpsFromBody !== undefined) {
    return { platformFeeBps: bpsFromBody, boostTier: null };
  }

  return {
    platformFeeBps: config.monetizationPlatformFeeBps,
    boostTier: null
  };
}

function clampSessionPlatformFeeBps(raw, config) {
  const fallback = Number(config.monetizationPlatformFeeBps);
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return fallback;
  }
  const min = config.monetizationPlatformFeeBpsMin;
  const max = config.monetizationPlatformFeeBpsMax;
  return Math.min(max, Math.max(min, n));
}

function normalizeCurrency(value) {
  return String(value || "usd")
    .trim()
    .toLowerCase()
    .slice(0, 3);
}

function normalizeAffiliateCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 64);
}

function parseProductAudienceTarget(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return "both";
  }
  const target = String(rawValue).trim().toLowerCase();
  if (!AUDIENCE_TARGETS.has(target)) {
    throw httpError(400, "audienceTarget must be b2b, b2c, or both");
  }
  return target;
}

function parseProductBusinessCategory(rawValue) {
  const value = optionalString(rawValue, "businessCategory", 64);
  return value ? value.trim().toLowerCase() : null;
}

function createMonetizationRouter({ db, config, logger, monetizationGateway, mediaStorage, analytics }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });
  const optionalAuthMiddleware = authenticateOptional({ config, db });
  const log = logger || { info: () => {}, error: () => {}, warn: () => {} };

  if (!monetizationGateway) {
    throw new Error("monetizationGateway is required");
  }

  const guestProductCheckoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false
  });

  const purchaseTokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  const productImportLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator(req) {
      return req.user?.id ? `product-import:${req.user.id}` : req.ip;
    }
  });

  async function loadActorPersonaCapabilities(userId) {
    const profileResult = await db.query(
      `SELECT profile_kind, seller_checklist_completed_at
       FROM profiles
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    if (profileResult.rowCount === 0) {
      throw httpError(404, "User profile not found");
    }
    return resolvePersonaCapabilities(profileResult.rows[0]);
  }

  async function requireCreatorOperationsCapability(userId) {
    const caps = await loadActorPersonaCapabilities(userId);
    if (!caps.can_create_products) {
      throw httpError(403, "Enable Professional or Business profile to use creator tools");
    }
    return caps;
  }

  async function requireBusinessOperationsCapability(userId) {
    const caps = await loadActorPersonaCapabilities(userId);
    if (!caps.can_manage_memberships) {
      throw httpError(403, "This action is available to Business profiles");
    }
    return caps;
  }

  function mapStripeImportRowsFromPrices(priceRows) {
    const items = [];
    for (const price of priceRows || []) {
      const unitAmount = Number(price.unit_amount);
      if (!Number.isInteger(unitAmount) || unitAmount <= 0) {
        continue;
      }
      const rawProduct = price.product;
      const stripeProductId = typeof rawProduct === "string" ? rawProduct : rawProduct?.id;
      if (!stripeProductId) {
        continue;
      }
      const productName =
        typeof rawProduct === "object" && rawProduct && !rawProduct.deleted ? String(rawProduct.name || "").trim() : "";
      const productActive =
        typeof rawProduct === "object" && rawProduct && !rawProduct.deleted ? Boolean(rawProduct.active) : true;
      const recurring = price.recurring || null;
      items.push({
        stripePriceId: price.id,
        stripeProductId,
        title: productName || stripeProductId,
        priceMinor: unitAmount,
        currency: normalizeCurrency(price.currency),
        recurring: recurring
          ? { interval: recurring.interval, intervalCount: recurring.interval_count || 1 }
          : null,
        productActive
      });
    }
    return items;
  }

  async function loadPurchaseTokenEntitlementRow(rawToken, { enforceUseLimit = true } = {}) {
    const trimmed = String(rawToken || "").trim();
    if (trimmed.length < 20) {
      throw httpError(400, "Invalid token");
    }
    const h = hashToken(trimmed);
    const r = await db.query(
      `SELECT t.id AS token_id, t.use_count, t.max_uses, t.expires_at, t.revoked_at,
              o.id AS order_id, o.status AS order_status, o.product_id, o.buyer_user_id,
              cp.title, cp.product_type, cp.delivery_media_key, cp.website_url, cp.creator_user_id
       FROM purchase_access_tokens t
       INNER JOIN orders o ON o.id = t.order_id
       INNER JOIN creator_products cp ON cp.id = o.product_id
       WHERE t.token_hash = $1
       LIMIT 1`,
      [h]
    );
    if (r.rowCount === 0) {
      throw httpError(404, "Invalid or expired link");
    }
    const row = r.rows[0];
    if (row.revoked_at) {
      throw httpError(404, "Invalid or expired link");
    }
    if (row.order_status !== "completed") {
      throw httpError(403, "Purchase is not active");
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw httpError(410, "This access link has expired");
    }
    if (enforceUseLimit && row.use_count >= row.max_uses) {
      throw httpError(429, "This link has been used too many times");
    }
    return row;
  }

  async function consumeTokenUse(tokenId) {
    const u = await db.query(
      `UPDATE purchase_access_tokens
       SET use_count = use_count + 1
       WHERE id = $1 AND use_count < max_uses
       RETURNING use_count`,
      [tokenId]
    );
    if (u.rowCount === 0) {
      throw httpError(429, "This link has been used too many times");
    }
  }

  async function ensureCheckoutSessionRecord({
    sessionId,
    kind,
    buyerUserId,
    sellerUserId,
    productId,
    amountMinor,
    currency,
    metadata = {}
  }) {
    const upsert = await db.query(
      `INSERT INTO checkout_sessions (
         buyer_user_id,
         seller_user_id,
         product_id,
         kind,
         stripe_checkout_session_id,
         amount_minor,
         currency,
         metadata,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'created')
       ON CONFLICT (stripe_checkout_session_id)
       DO UPDATE SET
         buyer_user_id = EXCLUDED.buyer_user_id,
         seller_user_id = EXCLUDED.seller_user_id,
         product_id = EXCLUDED.product_id,
         kind = EXCLUDED.kind,
         amount_minor = EXCLUDED.amount_minor,
         currency = EXCLUDED.currency,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING id, stripe_checkout_session_id`,
      [
        buyerUserId || null,
        sellerUserId,
        productId || null,
        kind,
        sessionId,
        amountMinor,
        currency,
        JSON.stringify(metadata || {})
      ]
    );
    return upsert.rows[0];
  }

  async function resolveAffiliateCode({ rawCode, sellerUserId, buyerUserId }) {
    const code = normalizeAffiliateCode(rawCode);
    if (!code) {
      return null;
    }
    const result = await db.query(
      `SELECT id, affiliate_user_id, code
       FROM affiliate_codes
       WHERE code = $1
         AND is_active = true
       LIMIT 1`,
      [code]
    );
    if (result.rowCount === 0) {
      throw httpError(404, "Affiliate code not found");
    }
    const affiliateCode = result.rows[0];
    if (affiliateCode.affiliate_user_id === sellerUserId) {
      throw httpError(400, "Creator cannot use their own affiliate code");
    }
    if (buyerUserId && affiliateCode.affiliate_user_id === buyerUserId) {
      throw httpError(400, "You cannot use your own affiliate code");
    }
    return affiliateCode;
  }

  async function ensureSellerPayoutReady(sellerUserId) {
    const result = await db.query(
      `SELECT charges_enabled, payouts_enabled, details_submitted
       FROM creator_payout_accounts
       WHERE user_id = $1
       LIMIT 1`,
      [sellerUserId]
    );
    if (result.rowCount === 0) {
      throw httpError(409, "Creator payout account is not connected");
    }
    const row = result.rows[0];
    if (!row.charges_enabled || !row.payouts_enabled || !row.details_submitted) {
      throw httpError(409, "Creator payout setup is incomplete");
    }
  }

  async function requireSellerStripeAccountId(sellerUserId) {
    const result = await db.query(
      `SELECT stripe_account_id, charges_enabled, payouts_enabled, details_submitted
       FROM creator_payout_accounts
       WHERE user_id = $1
       LIMIT 1`,
      [sellerUserId]
    );
    if (result.rowCount === 0) {
      throw httpError(409, "Creator payout account is not connected");
    }
    const row = result.rows[0];
    if (!row.charges_enabled || !row.payouts_enabled || !row.details_submitted) {
      throw httpError(409, "Creator payout setup is incomplete");
    }
    return row.stripe_account_id;
  }

  router.get(
    "/purchases/me",
    optionalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      if (!req.user) {
        res.status(200).json({ limit, offset, items: [] });
        return;
      }
      const result = await db.query(
        `SELECT
           o.id AS order_id,
           o.kind,
           o.status,
           o.amount_minor,
           o.currency,
           o.created_at,
           o.seller_user_id,
           u.username AS seller_username,
           sp.display_name AS seller_display_name,
           o.product_id,
           cp.title AS product_title,
           cp.product_type,
           cst.title AS tier_title
         FROM orders o
         JOIN users u ON u.id = o.seller_user_id
         JOIN profiles sp ON sp.user_id = o.seller_user_id
         LEFT JOIN checkout_sessions cs ON cs.id = o.checkout_session_id
         LEFT JOIN creator_products cp ON cp.id = o.product_id
         LEFT JOIN creator_subscription_tiers cst
           ON o.kind = 'subscription'
          AND (cs.metadata->>'tierId') ~ '^[0-9]+$'
          AND cst.id = (cs.metadata->>'tierId')::int
         WHERE o.buyer_user_id = $1
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );
      res.status(200).json({
        limit,
        offset,
        items: result.rows
      });
    })
  );

  router.post(
    "/connect/account",
    authMiddleware,
    asyncHandler(async (req, res) => {
      await requireCreatorOperationsCapability(req.user.id);
      const existing = await db.query(
        `SELECT id, user_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted
         FROM creator_payout_accounts
         WHERE user_id = $1
         LIMIT 1`,
        [req.user.id]
      );
      if (existing.rowCount > 0) {
        return res.status(200).json(existing.rows[0]);
      }

      const account = await monetizationGateway.createConnectedAccount({
        email: req.user.email
      });

      const created = await db.query(
        `INSERT INTO creator_payout_accounts (
           user_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, country
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, user_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, country`,
        [
          req.user.id,
          account.id,
          Boolean(account.charges_enabled),
          Boolean(account.payouts_enabled),
          Boolean(account.details_submitted),
          account.country || null
        ]
      );

      if (analytics) {
        await analytics.trackEvent("connect_account_created", {
          userId: req.user.id
        });
      }

      res.status(201).json(created.rows[0]);
    })
  );

  router.post(
    "/connect/onboarding-link",
    authMiddleware,
    asyncHandler(async (req, res) => {
      await requireCreatorOperationsCapability(req.user.id);
      const accountResult = await db.query(
        `SELECT stripe_account_id
         FROM creator_payout_accounts
         WHERE user_id = $1
         LIMIT 1`,
        [req.user.id]
      );
      if (accountResult.rowCount === 0) {
        throw httpError(404, "Creator payout account not found");
      }

      const link = await monetizationGateway.createOnboardingLink(
        accountResult.rows[0].stripe_account_id
      );
      res.status(200).json({
        url: link.url,
        expiresAt: link.expires_at
      });
    })
  );

  router.get(
    "/connect/status",
    optionalAuthMiddleware,
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(200).json({
          connected: false,
          feePolicy: getBoostTierPolicy(config),
          personaCapabilities: resolvePersonaCapabilities({ profile_kind: "consumer" })
        });
      }
      const personaCapabilities = await loadActorPersonaCapabilities(req.user.id);
      const accountResult = await db.query(
        `SELECT id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted
         FROM creator_payout_accounts
         WHERE user_id = $1
         LIMIT 1`,
        [req.user.id]
      );
      if (accountResult.rowCount === 0) {
        return res.status(200).json({
          connected: false,
          feePolicy: getBoostTierPolicy(config),
          personaCapabilities
        });
      }
      const accountRow = accountResult.rows[0];
      const stripeAccount = await monetizationGateway.retrieveConnectedAccount(accountRow.stripe_account_id);
      await db.query(
        `UPDATE creator_payout_accounts
         SET charges_enabled = $2,
             payouts_enabled = $3,
             details_submitted = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [
          accountRow.id,
          Boolean(stripeAccount.charges_enabled),
          Boolean(stripeAccount.payouts_enabled),
          Boolean(stripeAccount.details_submitted)
        ]
      );

      let dashboardUrl = null;
      try {
        const dashboardLink = await monetizationGateway.createDashboardLink(accountRow.stripe_account_id);
        dashboardUrl = dashboardLink.url;
      } catch {
        // Express login links are not available until Stripe enables dashboard access for this account.
      }

      return res.status(200).json({
        connected: true,
        stripeAccountId: accountRow.stripe_account_id,
        chargesEnabled: Boolean(stripeAccount.charges_enabled),
        payoutsEnabled: Boolean(stripeAccount.payouts_enabled),
        detailsSubmitted: Boolean(stripeAccount.details_submitted),
        dashboardUrl,
        feePolicy: getBoostTierPolicy(config),
        personaCapabilities
      });
    })
  );

  router.get(
    "/fee-policy",
    asyncHandler(async (_req, res) => {
      res.status(200).json(getBoostTierPolicy(config));
    })
  );

  router.post(
    "/products",
    authMiddleware,
    asyncHandler(async (req, res) => {
      await requireCreatorOperationsCapability(req.user.id);
      const title = requireString(req.body?.title, "title", 3, 180);
      const description = optionalString(req.body?.description, "description", 2000) || null;
      const priceMinor = Number(req.body?.priceMinor);
      const currency = normalizeCurrency(req.body?.currency);
      const productType = String(req.body?.productType || "digital").trim().toLowerCase();
      if (!PRODUCT_TYPES.has(productType)) {
        throw httpError(400, "productType must be digital, service, or subscription");
      }
      if (productType === "subscription" && config.monetizationAllowSubscriptionProductType !== true) {
        throw httpError(400, "Subscription products moved to Membership plans. Create a tier instead.");
      }
      const deliveryMediaKey = optionalString(req.body?.deliveryMediaKey, "deliveryMediaKey", 512) || null;
      const serviceDetails = optionalString(req.body?.serviceDetails, "serviceDetails", 2000) || null;
      const deliveryMethod = optionalString(req.body?.deliveryMethod, "deliveryMethod", 120) || null;
      const websiteUrl = optionalString(req.body?.websiteUrl, "websiteUrl", 2000) || null;
      if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) {
        throw httpError(400, "websiteUrl must be an absolute http(s) URL");
      }
      if (!Number.isInteger(priceMinor) || priceMinor <= 0) {
        throw httpError(400, "priceMinor must be a positive integer");
      }
      throwIfAnyUserFacingPolicyViolation(
        [title, description, serviceDetails, deliveryMethod, websiteUrl],
        config,
        {
          termMessage: "Product contains blocked language",
          urlMessage: "Product links to a blocked website"
        }
      );
      // Drafts may omit delivery until publish; publish and PATCH-to-published enforce delivery for digital.

      const audienceTarget = parseProductAudienceTarget(req.body?.audienceTarget);
      const businessCategory = parseProductBusinessCategory(req.body?.businessCategory);
      const { platformFeeBps, boostTier } = resolveProductPlatformFeeFields(req.body, null, config, {
        isPatch: false
      });

      const created = await db.query(
        `INSERT INTO creator_products (
           creator_user_id, title, description, price_minor, currency, delivery_media_key, product_type,
           service_details, delivery_method, website_url, audience_target, business_category,
           platform_fee_bps, boost_tier, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'draft')
         RETURNING *`,
        [
          req.user.id,
          title,
          description,
          priceMinor,
          currency,
          deliveryMediaKey,
          productType,
          serviceDetails,
          deliveryMethod,
          websiteUrl,
          audienceTarget,
          businessCategory,
          platformFeeBps,
          boostTier
        ]
      );
      if (analytics) {
        await analytics.trackEvent("creator_product_draft_saved", {
          creatorUserId: req.user.id,
          productId: created.rows[0].id,
          productType,
          currency,
          priceMinor,
          platformFeeBps,
          boostTier: boostTier || "custom"
        });
        if (productType === "subscription") {
          await analytics.trackEvent("subscription_producttype_deprecated_used", {
            creatorUserId: req.user.id,
            productId: created.rows[0].id,
            source: "create"
          });
        }
      }
      res.status(201).json(created.rows[0]);
    })
  );

  router.get(
    "/products/import/stripe",
    authMiddleware,
    productImportLimiter,
    asyncHandler(async (req, res) => {
      await requireCreatorOperationsCapability(req.user.id);
      const stripeAccountId = await requireSellerStripeAccountId(req.user.id);
      const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
      const startingAfter =
        typeof req.query.startingAfter === "string" && req.query.startingAfter.trim()
          ? req.query.startingAfter.trim()
          : null;
      const page = await monetizationGateway.listConnectAccountPrices({
        stripeAccountId,
        limit,
        startingAfter
      });
      const items = mapStripeImportRowsFromPrices(page.data || []);
      res.status(200).json({
        items,
        hasMore: Boolean(page.has_more),
        nextStartingAfter: page.has_more && page.data?.length ? page.data[page.data.length - 1].id : null
      });
    })
  );

  router.post(
    "/products/import/stripe/product-id",
    authMiddleware,
    productImportLimiter,
    asyncHandler(async (req, res) => {
      await requireCreatorOperationsCapability(req.user.id);
      const stripeAccountId = await requireSellerStripeAccountId(req.user.id);
      const stripeProductId = requireString(req.body?.stripeProductId, "stripeProductId", 3, 128);
      const pricesPage = await monetizationGateway.listConnectAccountPricesByProduct({
        stripeAccountId,
        productId: stripeProductId,
        limit: 50
      });
      const items = mapStripeImportRowsFromPrices(pricesPage.data || []).filter(
        (item) => item.stripeProductId === stripeProductId
      );
      if (items.length === 0) {
        throw httpError(404, "No active prices found for that Stripe product ID");
      }
      if (items.length > 1) {
        return res.status(409).json({
          message: "Multiple prices found. Choose one price to import.",
          stripeProductId,
          needsPriceSelection: true,
          items
        });
      }
      const selected = items[0];
      const price = await monetizationGateway.retrieveConnectAccountPrice({
        stripeAccountId,
        priceId: selected.stripePriceId
      });
      let product =
        typeof price.product === "object" && price.product && !price.product.deleted
          ? price.product
          : null;
      if (!product) {
        product = await monetizationGateway.retrieveConnectAccountProduct({
          stripeAccountId,
          productId: stripeProductId
        });
      }
      let draft;
      try {
        draft = mapStripeProductPriceToDraft(product, price);
      } catch (e) {
        throw httpError(400, e?.message || "Could not map Stripe product");
      }
      return res.status(200).json({
        draft,
        provenance: { stripeProductId, stripePriceId: selected.stripePriceId }
      });
    })
  );

  router.post(
    "/products/import/stripe",
    authMiddleware,
    productImportLimiter,
    asyncHandler(async (req, res) => {
      await requireCreatorOperationsCapability(req.user.id);
      const stripeAccountId = await requireSellerStripeAccountId(req.user.id);
      const stripeProductId = requireString(req.body?.stripeProductId, "stripeProductId", 3, 128);
      const stripePriceId = requireString(req.body?.stripePriceId, "stripePriceId", 3, 128);
      const price = await monetizationGateway.retrieveConnectAccountPrice({
        stripeAccountId,
        priceId: stripePriceId
      });
      const linkedId = typeof price.product === "string" ? price.product : price.product?.id;
      if (!linkedId || linkedId !== stripeProductId) {
        throw httpError(400, "stripePriceId does not belong to stripeProductId");
      }
      let product =
        typeof price.product === "object" && price.product && !price.product.deleted
          ? price.product
          : null;
      if (!product) {
        product = await monetizationGateway.retrieveConnectAccountProduct({
          stripeAccountId,
          productId: stripeProductId
        });
      }
      let draft;
      try {
        draft = mapStripeProductPriceToDraft(product, price);
      } catch (e) {
        throw httpError(400, e?.message || "Could not map Stripe product");
      }
      res.status(200).json({
        draft,
        provenance: { stripeProductId, stripePriceId }
      });
    })
  );

  router.post(
    "/products/import/url",
    authMiddleware,
    productImportLimiter,
    asyncHandler(async (req, res) => {
      await requireCreatorOperationsCapability(req.user.id);
      const url = requireString(req.body?.url, "url", 8, 2000);
      const result = await importProductDraftFromUrl(url);
      res.status(200).json(result);
    })
  );

  router.get(
    "/products/me",
    optionalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      if (!req.user) {
        res.status(200).json({ limit, offset, items: [] });
        return;
      }
      await requireCreatorOperationsCapability(req.user.id);
      const products = await db.query(
        `SELECT *
         FROM creator_products
         WHERE creator_user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );
      res.status(200).json({
        limit,
        offset,
        items: products.rows
      });
    })
  );

  router.get(
    "/products/creator/:creatorUserId",
    asyncHandler(async (req, res) => {
      const creatorUserId = Number(req.params.creatorUserId);
      if (!creatorUserId) {
        throw httpError(400, "creatorUserId must be a number");
      }
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 50);
      const rows = await db.query(
        `SELECT id, creator_user_id, title, description, price_minor, currency, product_type,
                service_details, delivery_method, website_url, audience_target, business_category,
                platform_fee_bps, boost_tier, status, created_at, updated_at
         FROM creator_products
         WHERE creator_user_id = $1
           AND status = 'published'
         ORDER BY updated_at DESC, id DESC
         LIMIT $2`,
        [creatorUserId, limit]
      );
      res.status(200).json({ items: rows.rows });
    })
  );

  router.get(
    "/catalog/products/:productId",
    asyncHandler(async (req, res) => {
      const productId = Number(req.params.productId);
      if (!productId) {
        throw httpError(400, "productId must be a number");
      }
      const result = await db.query(
        `SELECT cp.id, cp.creator_user_id, cp.title, cp.description, cp.price_minor, cp.currency,
                cp.product_type, cp.service_details, cp.delivery_method, cp.website_url,
                cp.audience_target, cp.business_category, cp.platform_fee_bps, cp.boost_tier,
                cp.status, cp.created_at, cp.updated_at,
                u.username AS creator_username,
                p.display_name AS creator_display_name,
                p.avatar_url AS creator_avatar_url
         FROM creator_products cp
         INNER JOIN users u ON u.id = cp.creator_user_id
         LEFT JOIN profiles p ON p.user_id = cp.creator_user_id
         WHERE cp.id = $1 AND cp.status = 'published'
         LIMIT 1`,
        [productId]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "Product not found");
      }
      if (analytics) {
        await analytics.trackEvent("product_offer_viewed", {
          productId,
          creatorUserId: result.rows[0].creator_user_id,
          source: "public_catalog"
        });
      }
      res.status(200).json(result.rows[0]);
    })
  );

  router.get(
    "/products/:productId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const productId = Number(req.params.productId);
      if (!productId) {
        throw httpError(400, "productId must be a number");
      }
      const result = await db.query(
        `SELECT *
         FROM creator_products
         WHERE id = $1
         LIMIT 1`,
        [productId]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "Product not found");
      }
      const product = result.rows[0];
      if (product.creator_user_id !== req.user.id && product.status !== "published") {
        throw httpError(404, "Product not found");
      }
      if (analytics) {
        await analytics.trackEvent("product_offer_viewed", {
          productId,
          creatorUserId: product.creator_user_id,
          viewerUserId: req.user.id,
          source: product.creator_user_id === req.user.id ? "creator_self" : "authenticated_catalog"
        });
      }
      res.status(200).json(product);
    })
  );

  router.patch(
    "/products/:productId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      await requireCreatorOperationsCapability(req.user.id);
      const productId = Number(req.params.productId);
      if (!productId) {
        throw httpError(400, "productId must be a number");
      }
      const current = await db.query(
        `SELECT *
         FROM creator_products
         WHERE id = $1
           AND creator_user_id = $2
         LIMIT 1`,
        [productId, req.user.id]
      );
      if (current.rowCount === 0) {
        throw httpError(404, "Product not found");
      }
      const previous = current.rows[0];
      const title = req.body?.title
        ? requireString(req.body?.title, "title", 3, 180)
        : previous.title;
      const description =
        req.body?.description !== undefined
          ? optionalString(req.body?.description, "description", 2000)
          : previous.description;
      const priceMinor =
        req.body?.priceMinor !== undefined ? Number(req.body.priceMinor) : previous.price_minor;
      if (!Number.isInteger(priceMinor) || priceMinor <= 0) {
        throw httpError(400, "priceMinor must be a positive integer");
      }
      const currency =
        req.body?.currency !== undefined ? normalizeCurrency(req.body.currency) : previous.currency;
      const productType =
        req.body?.productType !== undefined
          ? String(req.body.productType).trim().toLowerCase()
          : previous.product_type;
      if (!PRODUCT_TYPES.has(productType)) {
        throw httpError(400, "productType must be digital, service, or subscription");
      }
      if (
        req.body?.productType !== undefined &&
        productType === "subscription" &&
        config.monetizationAllowSubscriptionProductType !== true
      ) {
        throw httpError(400, "Subscription products moved to Membership plans. Create a tier instead.");
      }
      const deliveryMediaKey =
        req.body?.deliveryMediaKey !== undefined
          ? optionalString(req.body?.deliveryMediaKey, "deliveryMediaKey", 512)
          : previous.delivery_media_key;
      const serviceDetails =
        req.body?.serviceDetails !== undefined
          ? optionalString(req.body?.serviceDetails, "serviceDetails", 2000)
          : previous.service_details;
      const deliveryMethod =
        req.body?.deliveryMethod !== undefined
          ? optionalString(req.body?.deliveryMethod, "deliveryMethod", 120)
          : previous.delivery_method;
      const websiteUrl =
        req.body?.websiteUrl !== undefined
          ? optionalString(req.body?.websiteUrl, "websiteUrl", 2000)
          : previous.website_url;
      if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) {
        throw httpError(400, "websiteUrl must be an absolute http(s) URL");
      }
      throwIfAnyUserFacingPolicyViolation(
        [title, description, serviceDetails, deliveryMethod, websiteUrl],
        config,
        {
          termMessage: "Product contains blocked language",
          urlMessage: "Product links to a blocked website"
        }
      );
      const status =
        req.body?.status !== undefined ? String(req.body.status).trim().toLowerCase() : previous.status;
      if (!PRODUCT_STATUSES.has(status)) {
        throw httpError(400, "status must be draft, published, or archived");
      }
      if (productType === "digital" && !deliveryMediaKey && status === "published") {
        throw httpError(400, "Upload delivery media before publishing digital products");
      }
      const audienceTarget =
        req.body?.audienceTarget !== undefined
          ? parseProductAudienceTarget(req.body?.audienceTarget)
          : previous.audience_target;
      const businessCategory =
        req.body?.businessCategory !== undefined
          ? parseProductBusinessCategory(req.body?.businessCategory)
          : previous.business_category;
      const { platformFeeBps, boostTier } = resolveProductPlatformFeeFields(req.body, previous, config, {
        isPatch: true
      });

      const updated = await db.query(
        `UPDATE creator_products
         SET title = $3,
             description = $4,
             price_minor = $5,
             currency = $6,
             delivery_media_key = $7,
             product_type = $8,
             service_details = $9,
             delivery_method = $10,
             website_url = $11,
             audience_target = $12,
             business_category = $13,
             platform_fee_bps = $15,
             boost_tier = $16,
             status = $14,
             updated_at = NOW()
         WHERE id = $1
           AND creator_user_id = $2
         RETURNING *`,
        [
          productId,
          req.user.id,
          title,
          description,
          priceMinor,
          currency,
          deliveryMediaKey,
          productType,
          serviceDetails,
          deliveryMethod,
          websiteUrl,
          audienceTarget,
          businessCategory,
          status,
          platformFeeBps,
          boostTier
        ]
      );
      if (analytics) {
        await analytics.trackEvent(status === "published" ? "creator_product_published" : "creator_product_draft_saved", {
          creatorUserId: req.user.id,
          productId,
          productType,
          currency,
          priceMinor,
          platformFeeBps,
          boostTier: boostTier || "custom",
          source: "patch"
        });
        if (productType === "subscription") {
          await analytics.trackEvent("subscription_producttype_deprecated_used", {
            creatorUserId: req.user.id,
            productId,
            source: "patch"
          });
        }
      }
      res.status(200).json(updated.rows[0]);
    })
  );

  router.post(
    "/products/:productId/publish",
    authMiddleware,
    asyncHandler(async (req, res) => {
      await requireCreatorOperationsCapability(req.user.id);
      const productId = Number(req.params.productId);
      if (!productId) {
        throw httpError(400, "productId must be a number");
      }
      const existing = await db.query(
        `SELECT product_type, delivery_media_key
         FROM creator_products
         WHERE id = $1 AND creator_user_id = $2
         LIMIT 1`,
        [productId, req.user.id]
      );
      if (existing.rowCount === 0) {
        throw httpError(404, "Product not found");
      }
      const row = existing.rows[0];
      if (row.product_type === "digital" && !row.delivery_media_key) {
        throw httpError(400, "Upload delivery media before publishing digital products");
      }
      const updated = await db.query(
        `UPDATE creator_products
         SET status = 'published',
             updated_at = NOW()
         WHERE id = $1
           AND creator_user_id = $2
         RETURNING *`,
        [productId, req.user.id]
      );
      if (analytics && updated.rowCount > 0) {
        await analytics.trackEvent("creator_product_published", {
          creatorUserId: req.user.id,
          productId,
          source: "publish_endpoint"
        });
      }
      res.status(200).json(updated.rows[0]);
    })
  );

  router.post(
    "/tiers",
    authMiddleware,
    asyncHandler(async (req, res) => {
      await requireBusinessOperationsCapability(req.user.id);
      const title = requireString(req.body?.title, "title", 2, 120);
      const description = optionalString(req.body?.description, "description", 2000) || null;
      const monthlyPriceMinor = Number(req.body?.monthlyPriceMinor);
      if (!Number.isInteger(monthlyPriceMinor) || monthlyPriceMinor <= 0) {
        throw httpError(400, "monthlyPriceMinor must be a positive integer");
      }
      const currency = normalizeCurrency(req.body?.currency || "usd");
      const created = await db.query(
        `INSERT INTO creator_subscription_tiers (
           creator_user_id, title, description, monthly_price_minor, currency, status
         )
         VALUES ($1, $2, $3, $4, $5, 'draft')
         RETURNING *`,
        [req.user.id, title, description, monthlyPriceMinor, currency]
      );
      if (analytics) {
        await analytics.trackEvent("creator_tier_draft_saved", {
          creatorUserId: req.user.id,
          tierId: created.rows[0].id,
          currency,
          monthlyPriceMinor
        });
      }
      res.status(201).json(created.rows[0]);
    })
  );

  router.get(
    "/tiers/me",
    optionalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      if (!req.user) {
        res.status(200).json({ limit, offset, items: [] });
        return;
      }
      await requireBusinessOperationsCapability(req.user.id);
      const rows = await db.query(
        `SELECT *
         FROM creator_subscription_tiers
         WHERE creator_user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );
      res.status(200).json({ limit, offset, items: rows.rows });
    })
  );

  router.get(
    "/tiers/creator/:creatorUserId",
    asyncHandler(async (req, res) => {
      const creatorUserId = Number(req.params.creatorUserId);
      if (!creatorUserId) {
        throw httpError(400, "creatorUserId must be a number");
      }
      const rows = await db.query(
        `SELECT id, creator_user_id, title, description, monthly_price_minor, currency, status, created_at, updated_at
         FROM creator_subscription_tiers
         WHERE creator_user_id = $1
           AND status = 'published'
         ORDER BY monthly_price_minor ASC, id ASC`,
        [creatorUserId]
      );
      res.status(200).json({ items: rows.rows });
    })
  );

  router.patch(
    "/tiers/:tierId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      await requireBusinessOperationsCapability(req.user.id);
      const tierId = Number(req.params.tierId);
      if (!tierId) {
        throw httpError(400, "tierId must be a number");
      }
      const current = await db.query(
        `SELECT *
         FROM creator_subscription_tiers
         WHERE id = $1
           AND creator_user_id = $2
         LIMIT 1`,
        [tierId, req.user.id]
      );
      if (current.rowCount === 0) {
        throw httpError(404, "Tier not found");
      }
      const previous = current.rows[0];
      const title = req.body?.title ? requireString(req.body?.title, "title", 2, 120) : previous.title;
      const description =
        req.body?.description !== undefined
          ? optionalString(req.body?.description, "description", 2000)
          : previous.description;
      const monthlyPriceMinor =
        req.body?.monthlyPriceMinor !== undefined
          ? Number(req.body.monthlyPriceMinor)
          : previous.monthly_price_minor;
      if (!Number.isInteger(monthlyPriceMinor) || monthlyPriceMinor <= 0) {
        throw httpError(400, "monthlyPriceMinor must be a positive integer");
      }
      const currency =
        req.body?.currency !== undefined ? normalizeCurrency(req.body.currency) : previous.currency;
      const status =
        req.body?.status !== undefined ? String(req.body.status).trim().toLowerCase() : previous.status;
      if (!TIER_STATUSES.has(status)) {
        throw httpError(400, "status must be draft, published, or archived");
      }

      const updated = await db.query(
        `UPDATE creator_subscription_tiers
         SET title = $3,
             description = $4,
             monthly_price_minor = $5,
             currency = $6,
             status = $7,
             updated_at = NOW()
         WHERE id = $1
           AND creator_user_id = $2
         RETURNING *`,
        [tierId, req.user.id, title, description, monthlyPriceMinor, currency, status]
      );
      if (analytics && updated.rowCount > 0) {
        await analytics.trackEvent(status === "published" ? "creator_tier_published" : "creator_tier_draft_saved", {
          creatorUserId: req.user.id,
          tierId,
          currency,
          monthlyPriceMinor,
          source: "patch"
        });
      }
      res.status(200).json(updated.rows[0]);
    })
  );

  router.post(
    "/tiers/:tierId/publish",
    authMiddleware,
    asyncHandler(async (req, res) => {
      await requireBusinessOperationsCapability(req.user.id);
      const tierId = Number(req.params.tierId);
      if (!tierId) {
        throw httpError(400, "tierId must be a number");
      }
      const updated = await db.query(
        `UPDATE creator_subscription_tiers
         SET status = 'published',
             updated_at = NOW()
         WHERE id = $1
           AND creator_user_id = $2
         RETURNING *`,
        [tierId, req.user.id]
      );
      if (updated.rowCount === 0) {
        throw httpError(404, "Tier not found");
      }
      if (analytics) {
        await analytics.trackEvent("creator_tier_published", {
          creatorUserId: req.user.id,
          tierId,
          source: "publish_endpoint"
        });
      }
      res.status(200).json(updated.rows[0]);
    })
  );

  router.post(
    "/posts/:postId/product-attach",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const postId = Number(req.params.postId);
      const productId = Number(req.body?.productId);
      if (!postId || !productId) {
        throw httpError(400, "postId and productId must be numbers");
      }
      const ownerCheck = await db.query(
        `SELECT p.id
         FROM posts p
         JOIN creator_products cp ON cp.id = $2
         WHERE p.id = $1
           AND p.author_id = $3
           AND cp.creator_user_id = $3
         LIMIT 1`,
        [postId, productId, req.user.id]
      );
      if (ownerCheck.rowCount === 0) {
        throw httpError(404, "Post or product not found");
      }

      const upsert = await db.query(
        `INSERT INTO post_product_links (post_id, product_id)
         VALUES ($1, $2)
         ON CONFLICT (post_id)
         DO UPDATE SET product_id = EXCLUDED.product_id
         RETURNING *`,
        [postId, productId]
      );
      res.status(200).json(upsert.rows[0]);
    })
  );

  router.delete(
    "/posts/:postId/product-attach",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const postId = Number(req.params.postId);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }
      const removed = await db.query(
        `DELETE FROM post_product_links ppl
         USING posts p
         WHERE ppl.post_id = $1
           AND p.id = ppl.post_id
           AND p.author_id = $2
         RETURNING ppl.id`,
        [postId, req.user.id]
      );
      res.status(200).json({
        deleted: removed.rowCount > 0
      });
    })
  );

  router.post(
    "/checkout/product/:productId/guest",
    guestProductCheckoutLimiter,
    asyncHandler(async (req, res) => {
      const productId = Number(req.params.productId);
      if (!productId) {
        throw httpError(400, "productId must be a number");
      }
      const productResult = await db.query(
        `SELECT cp.*, u.email AS creator_email
         FROM creator_products cp
         JOIN users u ON u.id = cp.creator_user_id
         WHERE cp.id = $1
           AND cp.status = 'published'
         LIMIT 1`,
        [productId]
      );
      if (productResult.rowCount === 0) {
        throw httpError(404, "Product not found");
      }
      const product = productResult.rows[0];
      const guestEmail = optionalString(req.body?.guestEmail, "guestEmail", 320);
      const checkoutVariant = optionalString(req.body?.checkoutVariant, "checkoutVariant", 40) || "default";
      const smsOptIn = Boolean(req.body?.smsOptIn);
      if (guestEmail) {
        const ge = guestEmail.trim().toLowerCase();
        const ce = String(product.creator_email || "")
          .trim()
          .toLowerCase();
        if (ce && ge === ce) {
          throw httpError(400, "Sign in to manage your own products");
        }
      }

      const connectedAccountId = await requireSellerStripeAccountId(product.creator_user_id);
      const affiliateCode = await resolveAffiliateCode({
        rawCode: req.body?.affiliateCode,
        sellerUserId: product.creator_user_id,
        buyerUserId: null
      });

      const platformFeeBps = clampSessionPlatformFeeBps(product.platform_fee_bps, config);
      const applicationFeeAmountMinor = Math.max(
        0,
        Math.round((Number(product.price_minor) * platformFeeBps) / 10000)
      );

      const session = await monetizationGateway.createCheckoutSession({
        kind: "product",
        amountMinor: product.price_minor,
        currency: product.currency,
        buyerUserId: null,
        sellerUserId: product.creator_user_id,
        productId: product.id,
        affiliateCodeId: affiliateCode?.id || null,
        title: product.title,
        description: product.description,
        connectedAccountId,
        applicationFeeAmountMinor,
        platformFeeBps,
        customerEmail: guestEmail || null,
        collectPhone: smsOptIn,
        metadataExtra: {
          smsOptIn: smsOptIn ? "true" : "false",
          guestCheckout: "true",
          checkoutVariant
        }
      });

      await ensureCheckoutSessionRecord({
        sessionId: session.id,
        kind: "product",
        buyerUserId: null,
        sellerUserId: product.creator_user_id,
        productId: product.id,
        amountMinor: product.price_minor,
        currency: product.currency,
        metadata: {
          affiliateCodeId: affiliateCode?.id || null,
          platformFeeBps,
          stripeApplicationFeeMinor: applicationFeeAmountMinor,
          smsOptIn,
          guestCheckout: true,
          checkoutVariant
        }
      });
      if (analytics) {
        await analytics.trackEvent("checkout_started", {
          kind: "product",
          productId: product.id,
          sellerUserId: product.creator_user_id,
          buyerUserId: null,
          amountMinor: Number(product.price_minor),
          currency: product.currency,
          platformFeeBps,
          boostTier: product.boost_tier || "custom",
          checkoutVariant,
          guestCheckout: true
        });
      }

      res.status(200).json({
        checkoutSessionId: session.id,
        checkoutUrl: session.url
      });
    })
  );

  router.post(
    "/checkout/product/:productId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const productId = Number(req.params.productId);
      if (!productId) {
        throw httpError(400, "productId must be a number");
      }
      const productResult = await db.query(
        `SELECT *
         FROM creator_products
         WHERE id = $1
           AND status = 'published'
         LIMIT 1`,
        [productId]
      );
      if (productResult.rowCount === 0) {
        throw httpError(404, "Product not found");
      }
      const product = productResult.rows[0];
      if (product.creator_user_id === req.user.id) {
        throw httpError(400, "You cannot purchase your own product");
      }
      const connectedAccountId = await requireSellerStripeAccountId(product.creator_user_id);
      const affiliateCode = await resolveAffiliateCode({
        rawCode: req.body?.affiliateCode,
        sellerUserId: product.creator_user_id,
        buyerUserId: req.user.id
      });

      const platformFeeBps = clampSessionPlatformFeeBps(product.platform_fee_bps, config);
      const applicationFeeAmountMinor = Math.max(
        0,
        Math.round((Number(product.price_minor) * platformFeeBps) / 10000)
      );

      const smsOptIn = Boolean(req.body?.smsOptIn);
      const checkoutVariant = optionalString(req.body?.checkoutVariant, "checkoutVariant", 40) || "default";

      const session = await monetizationGateway.createCheckoutSession({
        kind: "product",
        amountMinor: product.price_minor,
        currency: product.currency,
        buyerUserId: req.user.id,
        sellerUserId: product.creator_user_id,
        productId: product.id,
        affiliateCodeId: affiliateCode?.id || null,
        title: product.title,
        description: product.description,
        connectedAccountId,
        applicationFeeAmountMinor,
        platformFeeBps,
        collectPhone: smsOptIn,
        metadataExtra: {
          smsOptIn: smsOptIn ? "true" : "false",
          guestCheckout: "false",
          checkoutVariant
        }
      });

      await ensureCheckoutSessionRecord({
        sessionId: session.id,
        kind: "product",
        buyerUserId: req.user.id,
        sellerUserId: product.creator_user_id,
        productId: product.id,
        amountMinor: product.price_minor,
        currency: product.currency,
        metadata: {
          affiliateCodeId: affiliateCode?.id || null,
          platformFeeBps,
          stripeApplicationFeeMinor: applicationFeeAmountMinor,
          smsOptIn,
          guestCheckout: false,
          checkoutVariant
        }
      });
      if (analytics) {
        await analytics.trackEvent("checkout_started", {
          kind: "product",
          productId: product.id,
          sellerUserId: product.creator_user_id,
          buyerUserId: req.user.id,
          amountMinor: Number(product.price_minor),
          currency: product.currency,
          platformFeeBps,
          boostTier: product.boost_tier || "custom",
          checkoutVariant,
          guestCheckout: false
        });
      }

      res.status(200).json({
        checkoutSessionId: session.id,
        checkoutUrl: session.url
      });
    })
  );

  router.post(
    "/checkout/support/:creatorUserId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const creatorUserId = Number(req.params.creatorUserId);
      const amountMinor = Number(req.body?.amountMinor);
      const currency = normalizeCurrency(req.body?.currency || "usd");
      if (!creatorUserId || !Number.isInteger(amountMinor) || amountMinor <= 0) {
        throw httpError(400, "creatorUserId and amountMinor are required");
      }
      if (creatorUserId === req.user.id) {
        throw httpError(400, "You cannot support yourself");
      }
      const creatorExists = await db.query(
        "SELECT id FROM users WHERE id = $1 AND is_active = true LIMIT 1",
        [creatorUserId]
      );
      if (creatorExists.rowCount === 0) {
        throw httpError(404, "Creator not found");
      }
      await ensureSellerPayoutReady(creatorUserId);
      const checkoutVariant = optionalString(req.body?.checkoutVariant, "checkoutVariant", 40) || "default";
      const affiliateCode = await resolveAffiliateCode({
        rawCode: req.body?.affiliateCode,
        sellerUserId: creatorUserId,
        buyerUserId: req.user.id
      });
      const session = await monetizationGateway.createCheckoutSession({
        kind: "support",
        amountMinor,
        currency,
        buyerUserId: req.user.id,
        sellerUserId: creatorUserId,
        productId: null,
        affiliateCodeId: affiliateCode?.id || null,
        title: "Support Creator",
        description: "One-time support payment",
        metadataExtra: {
          checkoutVariant
        }
      });
      await ensureCheckoutSessionRecord({
        sessionId: session.id,
        kind: "support",
        buyerUserId: req.user.id,
        sellerUserId: creatorUserId,
        productId: null,
        amountMinor,
        currency,
        metadata: {
          affiliateCodeId: affiliateCode?.id || null,
          platformFeeBps: Number(config.monetizationPlatformFeeBps || 350),
          checkoutVariant
        }
      });
      if (analytics) {
        await analytics.trackEvent("checkout_started", {
          kind: "support",
          sellerUserId: creatorUserId,
          buyerUserId: req.user.id,
          amountMinor,
          currency,
          platformFeeBps: Number(config.monetizationPlatformFeeBps || 350),
          checkoutVariant
        });
      }
      res.status(200).json({
        checkoutSessionId: session.id,
        checkoutUrl: session.url
      });
    })
  );

  router.post(
    "/checkout/tier/:tierId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const tierId = Number(req.params.tierId);
      if (!tierId) {
        throw httpError(400, "tierId must be a number");
      }
      const tierResult = await db.query(
        `SELECT *
         FROM creator_subscription_tiers
         WHERE id = $1
           AND status = 'published'
         LIMIT 1`,
        [tierId]
      );
      if (tierResult.rowCount === 0) {
        throw httpError(404, "Tier not found");
      }
      const tier = tierResult.rows[0];
      if (tier.creator_user_id === req.user.id) {
        throw httpError(400, "You cannot subscribe to your own tier");
      }
      await ensureSellerPayoutReady(tier.creator_user_id);
      const checkoutVariant = optionalString(req.body?.checkoutVariant, "checkoutVariant", 40) || "default";
      const affiliateCode = await resolveAffiliateCode({
        rawCode: req.body?.affiliateCode,
        sellerUserId: tier.creator_user_id,
        buyerUserId: req.user.id
      });
      const session = await monetizationGateway.createCheckoutSession({
        kind: "subscription",
        mode: "subscription",
        amountMinor: tier.monthly_price_minor,
        currency: tier.currency,
        buyerUserId: req.user.id,
        sellerUserId: tier.creator_user_id,
        tierId: tier.id,
        affiliateCodeId: affiliateCode?.id || null,
        title: `${tier.title} Membership`,
        description: tier.description || "Creator monthly membership",
        recurringInterval: "month",
        metadataExtra: {
          checkoutVariant
        }
      });
      await ensureCheckoutSessionRecord({
        sessionId: session.id,
        kind: "subscription",
        buyerUserId: req.user.id,
        sellerUserId: tier.creator_user_id,
        productId: null,
        amountMinor: tier.monthly_price_minor,
        currency: tier.currency,
        metadata: {
          tierId: tier.id,
          affiliateCodeId: affiliateCode?.id || null,
          platformFeeBps: Number(config.monetizationPlatformFeeBps || 350),
          checkoutVariant
        }
      });
      if (analytics) {
        await analytics.trackEvent("checkout_started", {
          kind: "subscription",
          tierId: tier.id,
          sellerUserId: tier.creator_user_id,
          buyerUserId: req.user.id,
          amountMinor: Number(tier.monthly_price_minor),
          currency: tier.currency,
          platformFeeBps: Number(config.monetizationPlatformFeeBps || 350),
          checkoutVariant
        });
      }
      res.status(200).json({
        checkoutSessionId: session.id,
        checkoutUrl: session.url
      });
    })
  );

  router.post(
    "/webhooks/stripe",
    asyncHandler(async (req, res) => {
      const signature = req.headers["stripe-signature"];
      const rawBody = req.rawBody;
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        throw httpError(400, "Stripe webhook requires the raw request body for signature verification");
      }
      const event = monetizationGateway.constructWebhookEvent({
        rawBody,
        signature: signature ? String(signature) : "",
        webhookSecret: config.stripeWebhookSecret
      });

      if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
        const subscriptionId = String(event.data.object?.id || "");
        if (!subscriptionId) {
          return res.status(200).json({ received: true, ignored: true });
        }
        const statusRaw = String(event.data.object?.status || "").toLowerCase();
        const mappedStatus = SUBSCRIPTION_STATUSES.has(statusRaw)
          ? statusRaw
          : event.type === "customer.subscription.deleted"
            ? "canceled"
            : "active";
        const currentPeriodEndSeconds = Number(event.data.object?.current_period_end || 0);
        const currentPeriodEnd = Number.isFinite(currentPeriodEndSeconds) && currentPeriodEndSeconds > 0
          ? new Date(currentPeriodEndSeconds * 1000).toISOString()
          : null;
        await db.query(
          `UPDATE creator_subscriptions
           SET status = $2,
               current_period_end = $3::timestamptz,
               cancel_at_period_end = $4,
               updated_at = NOW()
           WHERE stripe_subscription_id = $1`,
          [
            subscriptionId,
            mappedStatus,
            currentPeriodEnd,
            Boolean(event.data.object?.cancel_at_period_end)
          ]
        );
        return res.status(200).json({ received: true, processed: true });
      }

      if (event.type !== "checkout.session.completed") {
        return res.status(200).json({ received: true, ignored: true });
      }

      const conflictResult = await db.query(
        `INSERT INTO webhook_events (provider, event_id, event_type, payload)
         VALUES ('stripe', $1, $2, $3::jsonb)
         ON CONFLICT (provider, event_id)
         DO NOTHING
         RETURNING id`,
        [event.id, event.type, JSON.stringify(event.data.object || {})]
      );
      if (conflictResult.rowCount === 0) {
        return res.status(200).json({ received: true, duplicate: true });
      }

      const stripeSessionId = String(event.data.object?.id || "");
      if (!stripeSessionId) {
        throw httpError(400, "Webhook session id missing");
      }

      const dbSession = await db.query(
        `SELECT *
         FROM checkout_sessions
         WHERE stripe_checkout_session_id = $1
         LIMIT 1`,
        [stripeSessionId]
      );
      if (dbSession.rowCount === 0) {
        return res.status(200).json({ received: true, untracked: true });
      }
      const sessionRow = dbSession.rows[0];
      const alreadyOrdered = await db.query(
        "SELECT id FROM orders WHERE checkout_session_id = $1 LIMIT 1",
        [sessionRow.id]
      );
      if (alreadyOrdered.rowCount > 0) {
        await db.query(
          `UPDATE checkout_sessions
           SET status = 'completed',
               updated_at = NOW()
           WHERE id = $1`,
          [sessionRow.id]
        );
        return res.status(200).json({ received: true, duplicateOrder: true });
      }

      const sessionMetadata =
        sessionRow.metadata && typeof sessionRow.metadata === "object" ? sessionRow.metadata : {};
      let amountMinor = Number(sessionRow.amount_minor);
      const stripeTotal = Number(event.data.object?.amount_total);
      if (Number.isInteger(stripeTotal) && stripeTotal > 0 && stripeTotal !== amountMinor) {
        amountMinor = stripeTotal;
      }
      const platformFeeBps = clampSessionPlatformFeeBps(sessionMetadata.platformFeeBps, config);
      const recordedAppFee = Number(sessionMetadata.stripeApplicationFeeMinor);
      let platformFeeMinor;
      if (sessionRow.kind === "product" && Number.isInteger(recordedAppFee) && recordedAppFee >= 0) {
        platformFeeMinor = Math.min(amountMinor, recordedAppFee);
      } else {
        platformFeeMinor = Math.max(0, Math.round((amountMinor * platformFeeBps) / 10000));
      }
      const affiliateCodeId = Number(sessionMetadata.affiliateCodeId || 0) || null;
      const tierId = Number(sessionMetadata.tierId || 0) || null;

      let productFulfillmentOrderId = null;
      let affiliateCommissionMinor = 0;
      let creatorNetMinor = 0;

      await db.query("BEGIN");
      try {
        affiliateCommissionMinor = 0;
        let affiliateCodeRow = null;
        if (affiliateCodeId) {
          const affiliateCodeResult = await db.query(
            `SELECT id, affiliate_user_id
             FROM affiliate_codes
             WHERE id = $1
               AND is_active = true
             LIMIT 1`,
            [affiliateCodeId]
          );
          if (affiliateCodeResult.rowCount > 0) {
            affiliateCodeRow = affiliateCodeResult.rows[0];
            affiliateCommissionMinor = Math.max(
              0,
              Math.round((amountMinor * Number(config.affiliateGlobalCommissionBps || 700)) / 10000)
            );
          }
        }

        creatorNetMinor = Math.max(0, amountMinor - platformFeeMinor - affiliateCommissionMinor);

        const order = await db.query(
          `INSERT INTO orders (
             checkout_session_id,
             buyer_user_id,
             seller_user_id,
             product_id,
             kind,
             amount_minor,
             platform_fee_minor,
             creator_net_minor,
             currency,
             status,
             stripe_payment_intent_id
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', $10)
           RETURNING *`,
          [
            sessionRow.id,
            sessionRow.buyer_user_id,
            sessionRow.seller_user_id,
            sessionRow.product_id,
            sessionRow.kind,
            amountMinor,
            platformFeeMinor,
            creatorNetMinor,
            sessionRow.currency,
            event.data.object?.payment_intent ? String(event.data.object.payment_intent) : null
          ]
        );
        await db.query(
          `INSERT INTO earnings_ledger (user_id, order_id, entry_type, amount_minor, currency, note)
           VALUES ($1, $2, 'credit', $3, $4, $5)`,
          [
            sessionRow.seller_user_id,
            order.rows[0].id,
            creatorNetMinor,
            sessionRow.currency,
            sessionRow.kind === "product"
              ? "Product purchase credit"
              : sessionRow.kind === "subscription"
                ? "Membership payment credit"
                : "Support payment credit"
          ]
        );
        if (sessionRow.kind === "subscription" && tierId) {
          const subscriptionId = event.data.object?.subscription
            ? String(event.data.object.subscription)
            : null;
          await db.query(
            `INSERT INTO creator_subscriptions (
               tier_id,
               creator_user_id,
               subscriber_user_id,
               stripe_subscription_id,
               status,
               current_period_end,
               cancel_at_period_end
             )
             VALUES ($1, $2, $3, $4, 'active', NULL, false)
             ON CONFLICT (subscriber_user_id, creator_user_id)
             DO UPDATE SET
               tier_id = EXCLUDED.tier_id,
               stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, creator_subscriptions.stripe_subscription_id),
               status = 'active',
               cancel_at_period_end = false,
               updated_at = NOW()`,
            [tierId, sessionRow.seller_user_id, sessionRow.buyer_user_id, subscriptionId]
          );
        }

        if (affiliateCodeRow) {
          await db.query(
            `INSERT INTO affiliate_conversions (
               affiliate_code_id,
               checkout_session_id,
               order_id,
               affiliate_user_id,
               seller_user_id,
               buyer_user_id,
               amount_minor,
               commission_minor,
               currency
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (order_id)
             DO NOTHING`,
            [
              affiliateCodeRow.id,
              sessionRow.id,
              order.rows[0].id,
              affiliateCodeRow.affiliate_user_id,
              sessionRow.seller_user_id,
              sessionRow.buyer_user_id,
              amountMinor,
              affiliateCommissionMinor,
              sessionRow.currency
            ]
          );
          if (affiliateCommissionMinor > 0) {
            await db.query(
              `INSERT INTO earnings_ledger (user_id, order_id, entry_type, amount_minor, currency, note)
               VALUES ($1, $2, 'credit', $3, $4, $5)`,
              [
                affiliateCodeRow.affiliate_user_id,
                order.rows[0].id,
                affiliateCommissionMinor,
                sessionRow.currency,
                "Affiliate commission credit"
              ]
            );
          }
          await db.query(
            `UPDATE affiliate_codes
             SET uses_count = uses_count + 1,
                 updated_at = NOW()
             WHERE id = $1`,
            [affiliateCodeRow.id]
          );
        }

        await db.query(
          `UPDATE checkout_sessions
           SET status = 'completed',
               updated_at = NOW()
           WHERE id = $1`,
          [sessionRow.id]
        );
        if (sessionRow.kind === "product") {
          productFulfillmentOrderId = order.rows[0].id;
        }
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }

      if (productFulfillmentOrderId) {
        const contact = extractCheckoutCustomerContact(event.data.object);
        const meta =
          sessionRow.metadata && typeof sessionRow.metadata === "object" ? sessionRow.metadata : {};
        const smsOptIn = parseSmsOptIn(meta);
        setImmediate(() => {
          void (async () => {
            try {
              const pt = await db.query(`SELECT title FROM creator_products WHERE id = $1 LIMIT 1`, [
                sessionRow.product_id
              ]);
              const productTitle = pt.rows[0]?.title || "Your purchase";
              await fulfillProductOrderAfterPayment({
                db,
                config,
                logger: log,
                orderId: productFulfillmentOrderId,
                customerEmail: contact.email,
                customerPhone: contact.phone,
                productTitle,
                smsOptIn
              });
            } catch (err) {
              log.error({ err, orderId: productFulfillmentOrderId }, "purchase_fulfillment_async_failed");
            }
          })();
        });
      }

      if (analytics) {
        await analytics.trackEvent("purchase_completed", {
          checkoutSessionId: stripeSessionId,
          sellerUserId: sessionRow.seller_user_id,
          buyerUserId: sessionRow.buyer_user_id,
          productId: sessionRow.product_id || null,
          kind: sessionRow.kind,
          amountMinor,
          currency: sessionRow.currency,
          platformFeeMinor,
          platformFeeBps,
          creatorNetMinor,
          affiliateCodeId,
          affiliateCommissionMinor,
          checkoutVariant: sessionMetadata.checkoutVariant || "default"
        });
      }

      return res.status(200).json({ received: true, processed: true });
    })
  );

  function readQueryToken(req) {
    const raw = req.query?.token;
    const s = Array.isArray(raw) ? raw[0] : raw;
    return requireString(s != null ? String(s) : "", "token", 20, 512);
  }

  router.get(
    "/purchase/access",
    purchaseTokenLimiter,
    asyncHandler(async (req, res) => {
      const token = readQueryToken(req);
      const row = await loadPurchaseTokenEntitlementRow(token, { enforceUseLimit: false });
      res.status(200).json({
        orderId: row.order_id,
        productId: row.product_id,
        title: row.title,
        productType: row.product_type,
        websiteUrl: row.website_url || null,
        hasDigitalDelivery: row.product_type === "digital" && Boolean(row.delivery_media_key)
      });
    })
  );

  router.get(
    "/purchase/download",
    purchaseTokenLimiter,
    asyncHandler(async (req, res) => {
      const token = readQueryToken(req);
      const row = await loadPurchaseTokenEntitlementRow(token);
      await consumeTokenUse(row.token_id);
      if (row.product_type === "digital") {
        if (!row.delivery_media_key) {
          throw httpError(404, "Digital asset not available");
        }
        const downloadUrl = mediaStorage?.resolveMediaUrl
          ? mediaStorage.resolveMediaUrl({
              mediaKey: row.delivery_media_key,
              mediaUrl: row.delivery_media_key
            })
          : row.delivery_media_key;
        if (downloadUrl && /^https?:\/\//i.test(downloadUrl)) {
          return res.redirect(302, downloadUrl);
        }
        return res.status(200).json({ downloadUrl });
      }
      if (row.website_url && /^https?:\/\//i.test(row.website_url)) {
        return res.redirect(302, row.website_url);
      }
      throw httpError(404, "No download URL for this product type");
    })
  );

  router.post(
    "/purchase/claim/attach",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const token = requireString(req.body?.token, "token", 20, 512);
      const row = await loadPurchaseTokenEntitlementRow(token, { enforceUseLimit: false });
      if (row.buyer_user_id != null && row.buyer_user_id !== req.user.id) {
        throw httpError(409, "This purchase is already linked to another account");
      }
      if (row.buyer_user_id === req.user.id) {
        return res.status(200).json({ attached: false, alreadyYours: true });
      }
      const updated = await db.query(
        `UPDATE orders
         SET buyer_user_id = $2
         WHERE id = $1
           AND buyer_user_id IS NULL
         RETURNING id`,
        [row.order_id, req.user.id]
      );
      if (updated.rowCount === 0) {
        throw httpError(409, "Could not attach purchase");
      }
      res.status(200).json({ attached: true });
    })
  );

  router.get(
    "/products/:productId/access",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const productId = Number(req.params.productId);
      if (!productId) {
        throw httpError(400, "productId must be a number");
      }
      const productResult = await db.query(
        `SELECT id, creator_user_id, status
         FROM creator_products
         WHERE id = $1
         LIMIT 1`,
        [productId]
      );
      if (productResult.rowCount === 0) {
        throw httpError(404, "Product not found");
      }
      const product = productResult.rows[0];
      const isOwner = product.creator_user_id === req.user.id;
      let hasPurchased = false;
      if (!isOwner) {
        const orderResult = await db.query(
          `SELECT id
           FROM orders
           WHERE product_id = $1
             AND buyer_user_id = $2
             AND status = 'completed'
           LIMIT 1`,
          [productId, req.user.id]
        );
        hasPurchased = orderResult.rowCount > 0;
      }
      return res.status(200).json({
        productId,
        canAccess: isOwner || hasPurchased,
        isOwner,
        hasPurchased
      });
    })
  );

  router.get(
    "/subscriptions/creator/:creatorUserId/access",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const creatorUserId = Number(req.params.creatorUserId);
      if (!creatorUserId) {
        throw httpError(400, "creatorUserId must be a number");
      }
      const result = await db.query(
        `SELECT id, tier_id, status, current_period_end, cancel_at_period_end
         FROM creator_subscriptions
         WHERE creator_user_id = $1
           AND subscriber_user_id = $2
         LIMIT 1`,
        [creatorUserId, req.user.id]
      );
      if (result.rowCount === 0) {
        return res.status(200).json({
          creatorUserId,
          subscribed: false
        });
      }
      const row = result.rows[0];
      const isSubscribed = row.status === "active" || row.status === "past_due";
      return res.status(200).json({
        creatorUserId,
        subscribed: isSubscribed,
        tierId: row.tier_id,
        status: row.status,
        currentPeriodEnd: row.current_period_end,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end)
      });
    })
  );

  router.post(
    "/affiliate/codes",
    authMiddleware,
    asyncHandler(async (req, res) => {
      await requireBusinessOperationsCapability(req.user.id);
      const desiredCode = optionalString(req.body?.code, "code", 64);
      const generatedCode = `AFF${req.user.id}${Date.now().toString(36)}`.toUpperCase();
      const code = normalizeAffiliateCode(desiredCode || generatedCode);
      if (!code || code.length < 4) {
        throw httpError(400, "affiliate code must be at least 4 characters");
      }
      const created = await db.query(
        `INSERT INTO affiliate_codes (affiliate_user_id, code, is_active)
         VALUES ($1, $2, true)
         ON CONFLICT (code)
         DO NOTHING
         RETURNING *`,
        [req.user.id, code]
      );
      if (created.rowCount === 0) {
        throw httpError(409, "Affiliate code already exists");
      }
      res.status(201).json(created.rows[0]);
    })
  );

  router.get(
    "/affiliate/codes/me",
    optionalAuthMiddleware,
    asyncHandler(async (req, res) => {
      if (!req.user) {
        res.status(200).json({ items: [] });
        return;
      }
      await requireBusinessOperationsCapability(req.user.id);
      const rows = await db.query(
        `SELECT id, affiliate_user_id, code, is_active, uses_count, created_at, updated_at
         FROM affiliate_codes
         WHERE affiliate_user_id = $1
         ORDER BY created_at DESC, id DESC`,
        [req.user.id]
      );
      res.status(200).json({ items: rows.rows });
    })
  );

  router.get(
    "/affiliate/performance/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      await requireBusinessOperationsCapability(req.user.id);
      const summary = await db.query(
        `SELECT
           COALESCE(SUM(ac.amount_minor), 0)::int AS gross_referred_minor,
           COALESCE(SUM(ac.commission_minor), 0)::int AS commission_earned_minor,
           COUNT(*)::int AS conversions_count
         FROM affiliate_conversions ac
         WHERE ac.affiliate_user_id = $1`,
        [req.user.id]
      );
      const rows = await db.query(
        `SELECT ac.id, ac.amount_minor, ac.commission_minor, ac.currency, ac.created_at,
                ac.seller_user_id, p.display_name AS seller_display_name
         FROM affiliate_conversions ac
         JOIN profiles p ON p.user_id = ac.seller_user_id
         WHERE ac.affiliate_user_id = $1
         ORDER BY ac.created_at DESC, ac.id DESC
         LIMIT 100`,
        [req.user.id]
      );
      res.status(200).json({
        summary: summary.rows[0],
        items: rows.rows
      });
    })
  );

  router.post(
    "/products/:productId/download-link",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const productId = Number(req.params.productId);
      if (!productId) {
        throw httpError(400, "productId must be a number");
      }
      const accessResult = await db.query(
        `SELECT cp.id, cp.creator_user_id, cp.delivery_media_key, cp.product_type, cp.website_url,
                EXISTS (
                  SELECT 1
                  FROM orders o
                  WHERE o.product_id = cp.id
                    AND o.buyer_user_id = $2
                    AND o.status = 'completed'
                ) AS has_purchased
         FROM creator_products cp
         WHERE cp.id = $1
         LIMIT 1`,
        [productId, req.user.id]
      );
      if (accessResult.rowCount === 0) {
        throw httpError(404, "Product not found");
      }
      const row = accessResult.rows[0];
      const canAccess = row.creator_user_id === req.user.id || row.has_purchased;
      if (!canAccess) {
        throw httpError(403, "Purchase required");
      }
      const downloadUrl =
        row.product_type === "digital"
          ? mediaStorage?.resolveMediaUrl
            ? mediaStorage.resolveMediaUrl({
                mediaKey: row.delivery_media_key,
                mediaUrl: row.delivery_media_key
              })
            : row.delivery_media_key
          : row.website_url || null;
      return res.status(200).json({
        productId,
        downloadUrl
      });
    })
  );

  router.get(
    "/earnings/me",
    optionalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      if (!req.user) {
        res.status(200).json({
          limit,
          offset,
          totals: {
            credits_minor: 0,
            debits_minor: 0,
            balance_minor: 0
          },
          items: []
        });
        return;
      }
      await requireCreatorOperationsCapability(req.user.id);
      const rows = await db.query(
        `SELECT id, user_id, order_id, entry_type, amount_minor, currency, note, created_at
         FROM earnings_ledger
         WHERE user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );
      const summary = await db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount_minor ELSE 0 END), 0)::int AS credits_minor,
           COALESCE(SUM(CASE WHEN entry_type IN ('debit','payout') THEN amount_minor ELSE 0 END), 0)::int AS debits_minor
         FROM earnings_ledger
         WHERE user_id = $1`,
        [req.user.id]
      );
      const credits = summary.rows[0]?.credits_minor || 0;
      const debits = summary.rows[0]?.debits_minor || 0;
      res.status(200).json({
        limit,
        offset,
        totals: {
          credits_minor: credits,
          debits_minor: debits,
          balance_minor: credits - debits
        },
        items: rows.rows
      });
    })
  );

  router.get(
    "/subscriptions/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const rows = await db.query(
        `SELECT cs.id, cs.tier_id, cs.creator_user_id, cs.status, cs.current_period_end, cs.cancel_at_period_end, cs.created_at,
                t.title AS tier_title, t.monthly_price_minor, t.currency,
                p.display_name AS creator_display_name
         FROM creator_subscriptions cs
         JOIN creator_subscription_tiers t ON t.id = cs.tier_id
         JOIN profiles p ON p.user_id = cs.creator_user_id
         WHERE cs.subscriber_user_id = $1
         ORDER BY cs.created_at DESC, cs.id DESC`,
        [req.user.id]
      );
      res.status(200).json({ items: rows.rows });
    })
  );

  router.get(
    "/rankings/top",
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const rows = await db.query(
        `SELECT
           o.seller_user_id AS creator_user_id,
           p.display_name AS creator_display_name,
           p.avatar_url AS creator_avatar_url,
           COALESCE(SUM(o.amount_minor), 0)::int AS gross_earnings_minor,
           COUNT(DISTINCT o.buyer_user_id)::int AS supporters_count,
           (
             COALESCE(SUM(o.amount_minor), 0)
             + COUNT(DISTINCT o.buyer_user_id) * 2000
             + COALESCE(SUM(ac.commission_minor), 0) * 0.5
           )::numeric AS score
         FROM orders o
         JOIN users u ON u.id = o.seller_user_id
         JOIN profiles p ON p.user_id = o.seller_user_id
         LEFT JOIN affiliate_conversions ac ON ac.order_id = o.id
         WHERE o.status = 'completed'
         GROUP BY o.seller_user_id, p.display_name, p.avatar_url
         ORDER BY score DESC, gross_earnings_minor DESC, creator_user_id ASC
         LIMIT $1`,
        [limit]
      );
      res.status(200).json({ limit, items: rows.rows });
    })
  );

  router.post(
    "/admin/migrate-subscription-products-to-tiers",
    authMiddleware,
    asyncHandler(async (req, res) => {
      if (!["admin", "moderator"].includes(String(req.user.role || ""))) {
        throw httpError(403, "Insufficient permissions");
      }
      const limit = Math.min(Math.max(Number(req.body?.limit) || 100, 1), 500);
      const dryRun = req.body?.dryRun === undefined ? true : Boolean(req.body?.dryRun);
      const legacyRows = await db.query(
        `SELECT id, creator_user_id, title, description, price_minor, currency, status
         FROM creator_products
         WHERE product_type = 'subscription'
           AND status IN ('draft', 'published')
         ORDER BY id ASC
         LIMIT $1`,
        [limit]
      );

      const items = [];
      let createdCount = 0;
      let skippedCount = 0;

      for (const row of legacyRows.rows) {
        const marker = `[migrated_from_subscription_product:${row.id}]`;
        const existingTier = await db.query(
          `SELECT id, status
           FROM creator_subscription_tiers
           WHERE creator_user_id = $1
             AND description LIKE $2
           LIMIT 1`,
          [row.creator_user_id, `%${marker}%`]
        );

        if (existingTier.rowCount > 0) {
          skippedCount += 1;
          items.push({
            productId: row.id,
            action: "skipped_existing",
            tierId: existingTier.rows[0].id,
            tierStatus: existingTier.rows[0].status
          });
          continue;
        }

        if (dryRun) {
          items.push({
            productId: row.id,
            action: "would_create",
            creatorUserId: row.creator_user_id,
            title: row.title,
            monthlyPriceMinor: row.price_minor,
            currency: row.currency
          });
          continue;
        }

        const migratedDescription = [String(row.description || "").trim(), marker].filter(Boolean).join("\n\n");
        const inserted = await db.query(
          `INSERT INTO creator_subscription_tiers (
             creator_user_id, title, description, monthly_price_minor, currency, status
           )
           VALUES ($1, $2, $3, $4, $5, 'draft')
           RETURNING id, status`,
          [row.creator_user_id, row.title, migratedDescription || marker, row.price_minor, row.currency]
        );
        createdCount += 1;
        items.push({
          productId: row.id,
          action: "created",
          tierId: inserted.rows[0].id,
          tierStatus: inserted.rows[0].status
        });
        if (analytics) {
          await analytics.trackEvent("legacy_subscription_product_migrated_to_tier", {
            productId: row.id,
            creatorUserId: row.creator_user_id,
            tierId: inserted.rows[0].id
          });
        }
      }

      res.status(200).json({
        dryRun,
        limit,
        scanned: legacyRows.rowCount,
        createdCount,
        skippedCount,
        items
      });
    })
  );

  router.get(
    "/admin/summary",
    authMiddleware,
    asyncHandler(async (req, res) => {
      if (!["admin", "moderator"].includes(String(req.user.role || ""))) {
        throw httpError(403, "Insufficient permissions");
      }
      const summary = await db.query(
        `SELECT
           (SELECT COUNT(*)::int FROM creator_payout_accounts WHERE charges_enabled = true AND payouts_enabled = true) AS payout_ready_creators,
           (SELECT COALESCE(SUM(amount_minor), 0)::int FROM orders WHERE status = 'completed') AS gross_volume_minor,
           (SELECT COALESCE(SUM(platform_fee_minor), 0)::int FROM orders WHERE status = 'completed') AS platform_fee_minor,
           (SELECT COUNT(*)::int FROM creator_subscriptions WHERE status = 'active') AS active_subscriptions,
           (SELECT COUNT(*)::int FROM affiliate_conversions) AS affiliate_conversions_count`
      );
      const churn = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'canceled')::int AS canceled_count,
           COUNT(*) FILTER (WHERE status = 'active')::int AS active_count
         FROM creator_subscriptions`
      );
      res.status(200).json({
        summary: summary.rows[0],
        churn: churn.rows[0],
        config: {
          monetizationPlatformFeeBps: Number(config.monetizationPlatformFeeBps || 350),
          affiliateGlobalCommissionBps: Number(config.affiliateGlobalCommissionBps || 700)
        }
      });
    })
  );

  return router;
}

module.exports = {
  createMonetizationRouter
};
