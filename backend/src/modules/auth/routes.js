const express = require("express");
const { asyncHandler } = require("../../utils/async-handler");
const { createAuthService } = require("./service");

function createAuthRouter({ config, db }) {
  const router = express.Router();
  const authService = createAuthService({ config, db });

  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      const result = await authService.register(req.body || {});
      res.status(201).json(result);
    })
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const result = await authService.login(req.body || {});
      res.status(200).json(result);
    })
  );

  router.post(
    "/refresh",
    asyncHandler(async (req, res) => {
      const result = await authService.refresh(req.body || {});
      res.status(200).json(result);
    })
  );

  router.post(
    "/logout",
    asyncHandler(async (req, res) => {
      const result = await authService.logout(req.body || {});
      res.status(200).json(result);
    })
  );

  return router;
}

module.exports = {
  createAuthRouter
};
