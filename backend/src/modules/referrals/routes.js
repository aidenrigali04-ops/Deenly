const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { parseReferralShareBody, parseReferralCodePreviewQuery } = require("./referrals-route-params");

function createReferralsRouter({ config, db, referralReadService }) {
  const router = express.Router();
  const auth = authenticate({ config, db });

  router.get(
    "/code-preview",
    asyncHandler(async (req, res) => {
      const { rawReferralCode } = parseReferralCodePreviewQuery(req.query);
      const dto = await referralReadService.peekReferralCode({ rawReferralCode });
      res.status(200).json(dto);
    })
  );

  router.get(
    "/me",
    auth,
    asyncHandler(async (req, res) => {
      const dto = await referralReadService.getMe({ userId: req.user.id });
      res.status(200).json(dto);
    })
  );

  router.post(
    "/me/share",
    auth,
    asyncHandler(async (req, res) => {
      const { surface } = parseReferralShareBody(req.body);
      const dto = await referralReadService.recordShare({ userId: req.user.id, surface });
      res.status(200).json(dto);
    })
  );

  return router;
}

module.exports = {
  createReferralsRouter
};
