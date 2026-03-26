const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { requireString, optionalString } = require("../../utils/validators");

const PRODUCT_STATUSES = new Set(["draft", "published", "archived"]);
const PRODUCT_TYPES = new Set(["digital", "service", "subscription"]);
const AUDIENCE_TARGETS = new Set(["b2b", "b2c", "both"]);
const TIER_STATUSES = new Set(["draft", "published", "archived"]);
const SUBSCRIPTION_STATUSES = new Set(["active", "canceled", "past_due", "incomplete", "expired"]);

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

function createMonetizationRouter({ db, config, monetizationGateway, mediaStorage, analytics }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  if (!monetizationGateway) {
    throw new Error("monetizationGateway is required");
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

  router.post(
    "/connect/account",
    authMiddleware,
    asyncHandler(async (req, res) => {
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
    authMiddleware,
    asyncHandler(async (req, res) => {
      const accountResult = await db.query(
        `SELECT id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted
         FROM creator_payout_accounts
         WHERE user_id = $1
         LIMIT 1`,
        [req.user.id]
      );
      if (accountResult.rowCount === 0) {
        return res.status(200).json({
          connected: false
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

      const dashboardLink = await monetizationGateway.createDashboardLink(accountRow.stripe_account_id);
      return res.status(200).json({
        connected: true,
        stripeAccountId: accountRow.stripe_account_id,
        chargesEnabled: Boolean(stripeAccount.charges_enabled),
        payoutsEnabled: Boolean(stripeAccount.payouts_enabled),
        detailsSubmitted: Boolean(stripeAccount.details_submitted),
        dashboardUrl: dashboardLink.url
      });
    })
  );

  router.post(
    "/products",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const title = requireString(req.body?.title, "title", 3, 180);
      const description = optionalString(req.body?.description, "description", 2000) || null;
      const priceMinor = Number(req.body?.priceMinor);
      const currency = normalizeCurrency(req.body?.currency);
      const productType = String(req.body?.productType || "digital").trim().toLowerCase();
      if (!PRODUCT_TYPES.has(productType)) {
        throw httpError(400, "productType must be digital, service, or subscription");
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
      if (productType === "digital" && !deliveryMediaKey) {
        throw httpError(400, "deliveryMediaKey is required for digital products");
      }

      const audienceTarget = parseProductAudienceTarget(req.body?.audienceTarget);
      const businessCategory = parseProductBusinessCategory(req.body?.businessCategory);

      const created = await db.query(
        `INSERT INTO creator_products (
           creator_user_id, title, description, price_minor, currency, delivery_media_key, product_type,
           service_details, delivery_method, website_url, audience_target, business_category, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft')
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
          businessCategory
        ]
      );
      res.status(201).json(created.rows[0]);
    })
  );

  router.get(
    "/products/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
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
      res.status(200).json(product);
    })
  );

  router.patch(
    "/products/:productId",
    authMiddleware,
    asyncHandler(async (req, res) => {
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
      if (productType === "digital" && !deliveryMediaKey) {
        throw httpError(400, "deliveryMediaKey is required for digital products");
      }
      const status =
        req.body?.status !== undefined ? String(req.body.status).trim().toLowerCase() : previous.status;
      if (!PRODUCT_STATUSES.has(status)) {
        throw httpError(400, "status must be draft, published, or archived");
      }
      const audienceTarget =
        req.body?.audienceTarget !== undefined
          ? parseProductAudienceTarget(req.body?.audienceTarget)
          : previous.audience_target;
      const businessCategory =
        req.body?.businessCategory !== undefined
          ? parseProductBusinessCategory(req.body?.businessCategory)
          : previous.business_category;

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
          status
        ]
      );
      res.status(200).json(updated.rows[0]);
    })
  );

  router.post(
    "/products/:productId/publish",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const productId = Number(req.params.productId);
      if (!productId) {
        throw httpError(400, "productId must be a number");
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
      if (updated.rowCount === 0) {
        throw httpError(404, "Product not found");
      }
      res.status(200).json(updated.rows[0]);
    })
  );

  router.post(
    "/tiers",
    authMiddleware,
    asyncHandler(async (req, res) => {
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
      res.status(201).json(created.rows[0]);
    })
  );

  router.get(
    "/tiers/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
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
      res.status(200).json(updated.rows[0]);
    })
  );

  router.post(
    "/tiers/:tierId/publish",
    authMiddleware,
    asyncHandler(async (req, res) => {
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
      await ensureSellerPayoutReady(product.creator_user_id);
      const affiliateCode = await resolveAffiliateCode({
        rawCode: req.body?.affiliateCode,
        sellerUserId: product.creator_user_id,
        buyerUserId: req.user.id
      });

      const session = await monetizationGateway.createCheckoutSession({
        kind: "product",
        amountMinor: product.price_minor,
        currency: product.currency,
        buyerUserId: req.user.id,
        sellerUserId: product.creator_user_id,
        productId: product.id,
        affiliateCodeId: affiliateCode?.id || null,
        title: product.title,
        description: product.description
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
          platformFeeBps: Number(config.monetizationPlatformFeeBps || 350)
        }
      });

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
        description: "One-time support payment"
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
          platformFeeBps: Number(config.monetizationPlatformFeeBps || 350)
        }
      });
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
        recurringInterval: "month"
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
          platformFeeBps: Number(config.monetizationPlatformFeeBps || 350)
        }
      });
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
      const event = monetizationGateway.constructWebhookEvent({
        rawBody: req.rawBody || Buffer.from(JSON.stringify(req.body || {})),
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
      const amountMinor = Number(sessionRow.amount_minor);
      const platformFeeMinor = Math.round((amountMinor * Number(config.monetizationPlatformFeeBps || 350)) / 10000);
      const creatorNetMinor = Math.max(0, amountMinor - platformFeeMinor);
      const affiliateCodeId = Number(sessionMetadata.affiliateCodeId || 0) || null;
      const tierId = Number(sessionMetadata.tierId || 0) || null;

      await db.query("BEGIN");
      try {
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
            const affiliateCode = affiliateCodeResult.rows[0];
            const affiliateCommissionMinor = Math.max(
              0,
              Math.round(
                (amountMinor * Number(config.affiliateGlobalCommissionBps || 700)) / 10000
              )
            );
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
                affiliateCode.id,
                sessionRow.id,
                order.rows[0].id,
                affiliateCode.affiliate_user_id,
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
                  affiliateCode.affiliate_user_id,
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
              [affiliateCode.id]
            );
          }
        }

        await db.query(
          `UPDATE checkout_sessions
           SET status = 'completed',
               updated_at = NOW()
           WHERE id = $1`,
          [sessionRow.id]
        );
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }

      if (analytics) {
        await analytics.trackEvent("purchase_completed", {
          checkoutSessionId: stripeSessionId,
          sellerUserId: sessionRow.seller_user_id,
          buyerUserId: sessionRow.buyer_user_id,
          kind: sessionRow.kind
        });
      }

      return res.status(200).json({ received: true, processed: true });
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
    authMiddleware,
    asyncHandler(async (req, res) => {
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
    authMiddleware,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
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
