/**
 * Referrals module HTTP routes.
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const { asyncHandler } = require("../../utils/async-handler");
const { authenticate, authorize } = require("../../middleware/auth");
const { requireRewardString, requireEnum } = require("../rewards/validators");
const { SHARE_CHANNELS } = require("../rewards/constants");

function createReferralsRouter({ db, config, referralService, adminService }) {
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

  router.get(
    "/code",
    auth,
    asyncHandler(async (req, res) => {
      const code = await referralService.getOrCreateCode(req.user.id);
      res.json({ data: code });
    })
  );

  router.get(
    "/status",
    auth,
    asyncHandler(async (req, res) => {
      const status = await referralService.getStatus({ userId: req.user.id });
      res.json({ data: status });
    })
  );

  router.post(
    "/share",
    auth,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const channel = requireEnum("channel", req.body?.channel, SHARE_CHANNELS);
      const result = await referralService.recordShare({
        userId: req.user.id,
        channel,
        metadata: req.body?.metadata || {},
      });
      res.status(201).json({ data: result });
    })
  );

  router.post(
    "/attribute",
    auth,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const code = requireRewardString("code", req.body?.code, { min: 4, max: 32 });
      const result = await referralService.attributeSignup({
        newUserId: req.user.id,
        code,
        deviceFingerprint: req.body?.device_fingerprint || null,
        ipAddress: req.ip,
      });
      res.status(201).json({ data: result });
    })
  );

  // ---------- Admin ----------

  const adminGuard = [auth, authorize(["admin", "moderator"])];

  router.post(
    "/admin/:referralId/approve",
    ...adminGuard,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const reason = requireRewardString("reason", req.body?.reason, { min: 3, max: 500 });
      const result = await adminService.approveReferral({
        adminId: req.user.id,
        referralId: req.params.referralId,
        reason,
      });
      res.json({ data: result });
    })
  );

  router.post(
    "/admin/:referralId/reject",
    ...adminGuard,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const reason = requireRewardString("reason", req.body?.reason, { min: 3, max: 500 });
      const result = await adminService.rejectReferral({
        adminId: req.user.id,
        referralId: req.params.referralId,
        reason,
      });
      res.json({ data: result });
    })
  );

  return router;
}

module.exports = { createReferralsRouter };
