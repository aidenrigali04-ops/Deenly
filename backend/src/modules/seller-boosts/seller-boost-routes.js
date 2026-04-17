const express = require("express");
const rateLimit = require("express-rate-limit");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");

function createSellerBoostRouter({ config, db, sellerBoostService, monetizationGateway }) {
  const router = express.Router();
  const auth = authenticate({ config, db });

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.user?.id || req.ip || "anon")
  });

  const checkoutLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.user?.id || req.ip || "anon")
  });

  router.post(
    "/purchases",
    auth,
    limiter,
    asyncHandler(async (req, res) => {
      const postIds = req.body?.postIds;
      const packageTierId = req.body?.packageTierId;
      const idempotencyKey = req.body?.idempotencyKey;
      const result = await sellerBoostService.createPurchase({
        sellerUserId: req.user.id,
        postIds,
        packageTierId,
        idempotencyKey,
        metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}
      });
      res.status(result.duplicate ? 200 : 201).json(result);
    })
  );

  router.get(
    "/purchases/me",
    auth,
    asyncHandler(async (req, res) => {
      const limit = Number(req.query.limit) || 20;
      const out = await sellerBoostService.listMyPurchases({ sellerUserId: req.user.id, limit });
      res.json(out);
    })
  );

  router.get(
    "/purchases/:purchaseId",
    auth,
    asyncHandler(async (req, res) => {
      const purchaseId = Number(req.params.purchaseId);
      const p = await sellerBoostService.getPurchase({ purchaseId, sellerUserId: req.user.id });
      if (!p) {
        throw httpError(404, "Not found");
      }
      res.json({ purchase: p });
    })
  );

  router.get(
    "/purchases/:purchaseId/targets",
    auth,
    asyncHandler(async (req, res) => {
      const postIds = await sellerBoostService.listTargetPostIds({
        purchaseId: Number(req.params.purchaseId),
        sellerUserId: req.user.id
      });
      res.json({ postIds });
    })
  );

  router.post(
    "/purchases/:purchaseId/cancel",
    auth,
    limiter,
    asyncHandler(async (req, res) => {
      const out = await sellerBoostService.cancelPendingPurchase({
        purchaseId: Number(req.params.purchaseId),
        sellerUserId: req.user.id
      });
      res.json(out);
    })
  );

  router.post(
    "/purchases/:purchaseId/checkout",
    auth,
    checkoutLimiter,
    asyncHandler(async (req, res) => {
      const purchaseId = Number(req.params.purchaseId);
      const p = await sellerBoostService.getPurchase({ purchaseId, sellerUserId: req.user.id });
      if (!p) {
        throw httpError(404, "Purchase not found");
      }
      if (p.status !== "pending_payment") {
        throw httpError(409, "Purchase is not awaiting payment");
      }
      if (!monetizationGateway) {
        throw httpError(503, "Payments not configured");
      }
      const session = await monetizationGateway.createCheckoutSession({
        kind: "seller_boost",
        mode: "payment",
        amountMinor: p.amountMinor,
        currency: p.currency,
        buyerUserId: req.user.id,
        sellerUserId: req.user.id,
        productId: null,
        title: "Seller rank assist",
        description: `Boost purchase #${purchaseId} (${p.packageTierId})`,
        metadataExtra: {
          sellerBoostPurchaseId: String(purchaseId)
        },
        customerEmail: typeof req.body?.customerEmail === "string" ? req.body.customerEmail : undefined
      });
      res.status(200).json({ url: session.url, sessionId: session.id });
    })
  );

  return router;
}

module.exports = { createSellerBoostRouter };
