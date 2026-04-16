/**
 * Rewards module HTTP routes.
 *
 * Buyer-facing endpoints (balance, history, checkout preview, tier, streak,
 * challenges) plus admin endpoints for rules, adjustments, freezes, and
 * audit log. All handlers delegate to the service layer — no business
 * logic lives here.
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { authenticate, authorize } = require("../../middleware/auth");
const {
  requirePositiveInt,
  requireNonNegativeInt,
  requireEnum,
  parsePagination,
  parseOffsetPagination,
  requireRewardString,
} = require("./validators");
const {
  LEDGER_SOURCES,
  LEDGER_TYPES,
  ADMIN_ACTION_TYPES,
} = require("./constants");

function createRewardsRouter({
  db,
  config,
  analytics,
  ledgerService,
  tierService,
  streakService,
  challengeService,
  checkoutService,
  adminService,
  rewardConfig,
}) {
  const router = express.Router();
  const auth = authenticate({ config, db });

  const writeLimiter =
    process.env.NODE_ENV === "test"
      ? (_req, _res, next) => next()
      : rateLimit({
          windowMs: 60 * 1000,
          limit: 30,
          standardHeaders: true,
          legacyHeaders: false,
        });

  // ---------- Balance & history (buyer) ----------

  router.get(
    "/balance",
    auth,
    asyncHandler(async (req, res) => {
      const state = await ledgerService.getAccountState(req.user.id);
      res.json({ data: state });
    })
  );

  router.get(
    "/history",
    auth,
    asyncHandler(async (req, res) => {
      const { limit, cursor } = parsePagination(req.query);
      const type = req.query.type
        ? requireEnum("type", req.query.type, LEDGER_TYPES)
        : null;
      const source = req.query.source
        ? requireEnum("source", req.query.source, LEDGER_SOURCES)
        : null;
      const page = await ledgerService.getHistory({
        userId: req.user.id,
        limit,
        cursor,
        type,
        source,
      });
      res.json(page);
    })
  );

  // ---------- Tier ----------

  router.get(
    "/tier",
    auth,
    asyncHandler(async (req, res) => {
      const info = await tierService.getTierInfo(req.user.id);
      res.json({ data: info });
    })
  );

  // ---------- Streak ----------

  router.get(
    "/streak",
    auth,
    asyncHandler(async (req, res) => {
      const state = await streakService.getStreakState(req.user.id);
      res.json({ data: state });
    })
  );

  router.post(
    "/streak/check-in",
    auth,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const result = await streakService.checkIn(req.user.id);
      res.status(result.already_checked_in ? 200 : 201).json({ data: result });
    })
  );

  // ---------- Challenges ----------

  router.get(
    "/challenges",
    auth,
    asyncHandler(async (req, res) => {
      const { limit, offset } = parseOffsetPagination(req.query);
      const result = await challengeService.listAvailable({
        userId: req.user.id,
        limit,
        offset,
        type: req.query.type || null,
        category: req.query.category || null,
      });
      res.json(result);
    })
  );

  router.get(
    "/challenges/mine",
    auth,
    asyncHandler(async (req, res) => {
      const { limit, offset } = parseOffsetPagination(req.query);
      const result = await challengeService.getUserChallenges({
        userId: req.user.id,
        limit,
        offset,
        status: req.query.status || null,
      });
      res.json(result);
    })
  );

  router.post(
    "/challenges/:challengeId/enroll",
    auth,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const result = await challengeService.enroll({
        userId: req.user.id,
        challengeId: req.params.challengeId,
      });
      res.status(201).json({ data: result });
    })
  );

  // ---------- Checkout preview ----------

  router.post(
    "/checkout/preview-earn",
    auth,
    asyncHandler(async (req, res) => {
      const cartTotalMinor = requirePositiveInt(
        "cart_total_minor",
        req.body?.cart_total_minor
      );
      const result = await checkoutService.previewEarn({
        userId: req.user.id,
        cartTotalMinor,
      });
      res.json({ data: result });
    })
  );

  router.post(
    "/checkout/preview-redemption",
    auth,
    asyncHandler(async (req, res) => {
      const cartTotalMinor = requirePositiveInt(
        "cart_total_minor",
        req.body?.cart_total_minor
      );
      const requestedPoints =
        req.body?.requested_points != null
          ? requireNonNegativeInt("requested_points", req.body.requested_points)
          : null;
      const result = await checkoutService.previewRedemption({
        userId: req.user.id,
        cartTotalMinor,
        requestedPoints,
      });
      res.json({ data: result });
    })
  );

  // ---------- Admin ----------

  const adminGuard = [auth, authorize(["admin", "moderator"])];

  router.post(
    "/admin/adjust",
    ...adminGuard,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const userId = requirePositiveInt("user_id", req.body?.user_id);
      const amount = requirePositiveInt("amount", req.body?.amount);
      const direction = requireEnum("direction", req.body?.direction, [
        "credit",
        "debit",
      ]);
      const reason = requireRewardString("reason", req.body?.reason, {
        min: 3,
        max: 500,
      });
      const result = await adminService.adjustPoints({
        adminId: req.user.id,
        userId,
        amount,
        direction,
        reason,
        metadata: req.body?.metadata || {},
      });
      res.status(201).json({ data: result });
    })
  );

  router.post(
    "/admin/freeze",
    ...adminGuard,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const userId = requirePositiveInt("user_id", req.body?.user_id);
      const frozen = Boolean(req.body?.frozen);
      const reason = requireRewardString("reason", req.body?.reason, {
        min: 3,
        max: 500,
      });
      const result = await adminService.setAccountFrozen({
        adminId: req.user.id,
        userId,
        frozen,
        reason,
      });
      res.json({ data: result });
    })
  );

  router.get(
    "/admin/rules",
    ...adminGuard,
    asyncHandler(async (_req, res) => {
      const all = await rewardConfig.getAll();
      res.json({ items: all });
    })
  );

  router.put(
    "/admin/rules/:key",
    ...adminGuard,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const key = req.params.key;
      if (req.body?.value === undefined) {
        throw httpError(400, "value is required");
      }
      const result = await adminService.updateRule({
        adminId: req.user.id,
        key,
        value: req.body.value,
        reason: req.body.reason || "rule_update",
      });
      res.json({ data: result });
    })
  );

  router.get(
    "/admin/budget",
    ...adminGuard,
    asyncHandler(async (_req, res) => {
      const status = await adminService.getBudgetStatus();
      res.json({ data: status });
    })
  );

  router.get(
    "/admin/audit-log",
    ...adminGuard,
    asyncHandler(async (req, res) => {
      const { limit, offset } = parseOffsetPagination(req.query);
      const actionType =
        req.query.action_type &&
        requireEnum("action_type", req.query.action_type, ADMIN_ACTION_TYPES);
      const result = await adminService.listAuditLog({
        actionType: actionType || undefined,
        targetType: req.query.target_type,
        adminId: req.query.admin_id ? Number(req.query.admin_id) : undefined,
        limit,
        offset,
      });
      res.json(result);
    })
  );

  return router;
}

module.exports = { createRewardsRouter };
