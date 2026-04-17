const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { optionalString } = require("../../utils/validators");

function createReferralsRouter({ config, db, referralReadService }) {
  const router = express.Router();
  const auth = authenticate({ config, db });

  router.get(
    "/me",
    auth,
    asyncHandler(async (req, res) => {
      const body = await referralReadService.getMe({ userId: req.user.id });
      res.status(200).json(body);
    })
  );

  router.post(
    "/me/share",
    auth,
    asyncHandler(async (req, res) => {
      const raw = req.body && typeof req.body === "object" ? req.body : {};
      const surface = optionalString(raw.surface, "surface", 64) || "unspecified";
      const body = await referralReadService.recordShare({ userId: req.user.id, surface });
      res.status(200).json(body);
    })
  );

  return router;
}

module.exports = {
  createReferralsRouter
};
