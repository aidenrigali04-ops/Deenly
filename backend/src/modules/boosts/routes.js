/**
 * Boosts module HTTP routes (seller).
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { authenticate } = require("../../middleware/auth");
const {
  requirePositiveInt,
  requireEnum,
  parseOffsetPagination,
} = require("../rewards/validators");
const { BOOST_TYPES, BOOST_STATUSES } = require("../rewards/constants");

function createBoostsRouter({ db, config, boostService }) {
  const router = express.Router();
  const auth = authenticate({ config, db });

  const writeLimiter =
    process.env.NODE_ENV === "test"
      ? (_req, _res, next) => next()
      : rateLimit({
          windowMs: 60 * 1000,
          limit: 20,
          standardHeaders: true,
          legacyHeaders: false,
        });

  router.get(
    "/",
    auth,
    asyncHandler(async (req, res) => {
      const { limit, offset } = parseOffsetPagination(req.query);
      const status = req.query.status
        ? requireEnum("status", req.query.status, BOOST_STATUSES)
        : null;
      const result = await boostService.listBoosts({
        sellerId: req.user.id,
        status,
        limit,
        offset,
      });
      res.json(result);
    })
  );

  router.post(
    "/",
    auth,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const type = requireEnum("type", req.body?.type, BOOST_TYPES);
      const budgetMinor = requirePositiveInt("budget_minor", req.body?.budget_minor);
      const multiplier = Number(req.body?.multiplier);
      if (!multiplier || multiplier <= 1) {
        throw httpError(400, "multiplier must be > 1");
      }
      const durationHours = requirePositiveInt("duration_hours", req.body?.duration_hours);
      const result = await boostService.createBoost({
        sellerId: req.user.id,
        listingId: req.body?.listing_id || null,
        storeId: req.body?.store_id || null,
        type,
        budgetMinor,
        multiplier,
        durationHours,
      });
      res.status(201).json({ data: result });
    })
  );

  router.get(
    "/:boostId",
    auth,
    asyncHandler(async (req, res) => {
      const result = await boostService.getBoost({
        boostId: req.params.boostId,
        sellerId: req.user.id,
      });
      res.json({ data: result });
    })
  );

  router.post(
    "/:boostId/activate",
    auth,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const result = await boostService.activateBoost({
        boostId: req.params.boostId,
        sellerId: req.user.id,
        paymentRef: req.body?.payment_reference || null,
      });
      res.json({ data: result });
    })
  );

  router.post(
    "/:boostId/pause",
    auth,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const result = await boostService.pauseBoost({
        boostId: req.params.boostId,
        sellerId: req.user.id,
      });
      res.json({ data: result });
    })
  );

  router.post(
    "/:boostId/resume",
    auth,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const result = await boostService.resumeBoost({
        boostId: req.params.boostId,
        sellerId: req.user.id,
      });
      res.json({ data: result });
    })
  );

  router.post(
    "/:boostId/cancel",
    auth,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const result = await boostService.cancelBoost({
        boostId: req.params.boostId,
        sellerId: req.user.id,
        reason: req.body?.reason || null,
      });
      res.json({ data: result });
    })
  );

  return router;
}

module.exports = { createBoostsRouter };
