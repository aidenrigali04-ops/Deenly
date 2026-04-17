const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { parseRewardsLedgerQuery } = require("./rewards-route-params");

function createRewardsRouter({ config, db, rewardsReadService }) {
  const router = express.Router();
  const auth = authenticate({ config, db });

  router.get(
    "/me",
    auth,
    asyncHandler(async (req, res) => {
      const dto = await rewardsReadService.getWalletMe({ userId: req.user.id });
      res.status(200).json(dto);
    })
  );

  router.get(
    "/ledger",
    auth,
    asyncHandler(async (req, res) => {
      const { cursor, limit } = parseRewardsLedgerQuery(req.query);
      const dto = await rewardsReadService.getLedgerPage({
        userId: req.user.id,
        cursor,
        limit
      });
      res.status(200).json(dto);
    })
  );

  return router;
}

module.exports = {
  createRewardsRouter
};
