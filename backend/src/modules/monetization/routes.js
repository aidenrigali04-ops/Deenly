const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { requireString, optionalString } = require("../../utils/validators");

const PRODUCT_STATUSES = new Set(["draft", "published", "archived"]);

function normalizeCurrency(value) {
  return String(value || "usd")
    .trim()
    .toLowerCase()
    .slice(0, 3);
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
    currency
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
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'created')
       ON CONFLICT (stripe_checkout_session_id)
       DO UPDATE SET
         buyer_user_id = EXCLUDED.buyer_user_id,
         seller_user_id = EXCLUDED.seller_user_id,
         product_id = EXCLUDED.product_id,
         kind = EXCLUDED.kind,
         amount_minor = EXCLUDED.amount_minor,
         currency = EXCLUDED.currency,
         updated_at = NOW()
       RETURNING id, stripe_checkout_session_id`,
      [buyerUserId || null, sellerUserId, productId || null, kind, sessionId, amountMinor, currency]
    );
    return upsert.rows[0];
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
      const deliveryMediaKey = requireString(req.body?.deliveryMediaKey, "deliveryMediaKey", 5, 512);
      if (!Number.isInteger(priceMinor) || priceMinor <= 0) {
        throw httpError(400, "priceMinor must be a positive integer");
      }

      const created = await db.query(
        `INSERT INTO creator_products (
           creator_user_id, title, description, price_minor, currency, delivery_media_key, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'draft')
         RETURNING *`,
        [req.user.id, title, description, priceMinor, currency, deliveryMediaKey]
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
      const deliveryMediaKey = req.body?.deliveryMediaKey
        ? requireString(req.body?.deliveryMediaKey, "deliveryMediaKey", 5, 512)
        : previous.delivery_media_key;
      const status =
        req.body?.status !== undefined ? String(req.body.status).trim().toLowerCase() : previous.status;
      if (!PRODUCT_STATUSES.has(status)) {
        throw httpError(400, "status must be draft, published, or archived");
      }

      const updated = await db.query(
        `UPDATE creator_products
         SET title = $3,
             description = $4,
             price_minor = $5,
             currency = $6,
             delivery_media_key = $7,
             status = $8,
             updated_at = NOW()
         WHERE id = $1
           AND creator_user_id = $2
         RETURNING *`,
        [productId, req.user.id, title, description, priceMinor, currency, deliveryMediaKey, status]
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

      const session = await monetizationGateway.createCheckoutSession({
        kind: "product",
        amountMinor: product.price_minor,
        currency: product.currency,
        buyerUserId: req.user.id,
        sellerUserId: product.creator_user_id,
        productId: product.id,
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
        currency: product.currency
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
      const session = await monetizationGateway.createCheckoutSession({
        kind: "support",
        amountMinor,
        currency,
        buyerUserId: req.user.id,
        sellerUserId: creatorUserId,
        productId: null,
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
        currency
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

      const amountMinor = Number(sessionRow.amount_minor);
      const platformFeeMinor = Math.round((amountMinor * Number(config.monetizationPlatformFeeBps || 350)) / 10000);
      const creatorNetMinor = Math.max(0, amountMinor - platformFeeMinor);

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
            sessionRow.kind === "product" ? "Product purchase credit" : "Support payment credit"
          ]
        );
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

  router.post(
    "/products/:productId/download-link",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const productId = Number(req.params.productId);
      if (!productId) {
        throw httpError(400, "productId must be a number");
      }
      const accessResult = await db.query(
        `SELECT cp.id, cp.creator_user_id, cp.delivery_media_key,
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
      const downloadUrl = mediaStorage?.resolveMediaUrl
        ? mediaStorage.resolveMediaUrl({
            mediaKey: row.delivery_media_key,
            mediaUrl: row.delivery_media_key
          })
        : row.delivery_media_key;
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

  return router;
}

module.exports = {
  createMonetizationRouter
};
