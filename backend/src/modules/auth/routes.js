const express = require("express");
const rateLimit = require("express-rate-limit");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { createAuthService } = require("./service");

function createAuthRouter({ config, db, analytics }) {
  const router = express.Router();
  const authService = createAuthService({ config, db, analytics });
  const authMiddleware = authenticate({ config, db });

  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator(req) {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "anon";
      return `${req.ip}:${email}`;
    }
  });

  router.post(
    "/register",
    authRateLimiter,
    asyncHandler(async (req, res) => {
      const result = await authService.register(req.body || {});
      res.status(201).json(result);
    })
  );

  router.post(
    "/login",
    authRateLimiter,
    asyncHandler(async (req, res) => {
      const result = await authService.login(req.body || {});
      res.status(200).json(result);
    })
  );

  router.post(
    "/google",
    authRateLimiter,
    asyncHandler(async (req, res) => {
      const result = await authService.loginWithGoogle(req.body || {});
      res.status(200).json(result);
    })
  );

  router.post(
    "/refresh",
    authRateLimiter,
    asyncHandler(async (req, res) => {
      const result = await authService.refresh(req.body || {});
      res.status(200).json(result);
    })
  );

  router.post(
    "/logout",
    authRateLimiter,
    asyncHandler(async (req, res) => {
      const result = await authService.logout(req.body || {});
      res.status(200).json(result);
    })
  );

  router.get(
    "/session/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      res.status(200).json({
        user: {
          id: req.user.id,
          email: req.user.email,
          username: req.user.username,
          role: req.user.role,
          createdAt: req.user.created_at
        }
      });
    })
  );

  return router;
}

module.exports = {
  createAuthRouter
};
