const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { optionalString } = require("../../utils/validators");

function createRewardsRouter({ config, db, rewardsReadService }) {
  const router = express.Router();
  const auth = authenticate({ config, db });

  router.get(
    "/me",
    auth,
    asyncHandler(async (req, res) => {
      const body = await rewardsReadService.getWalletMe({ userId: req.user.id });
      res.status(200).json(body);
    })
  );

  router.get(
    "/ledger",
    auth,
    asyncHandler(async (req, res) => {
      const cursor = optionalString(req.query.cursor, "cursor");
      const limitRaw = req.query.limit;
      let limit = 20;
      if (limitRaw != null && limitRaw !== "") {
        const n = Number(limitRaw);
        if (Number.isFinite(n)) {
          limit = Math.min(100, Math.max(1, Math.floor(n)));
        }
      }
      const body = await rewardsReadService.getLedgerPage({
        userId: req.user.id,
        cursor: cursor || null,
        limit
      });
      res.status(200).json(body);
    })
  );

  return router;
}

module.exports = {
  createRewardsRouter
};
