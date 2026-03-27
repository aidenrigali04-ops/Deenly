const express = require("express");
const rateLimit = require("express-rate-limit");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { createAuthService } = require("./service");

function createAuthRouter({ config, db, analytics }) {
  const router = express.Router();
  const authService = createAuthService({ config, db, analytics });
  const authMiddleware = authenticate({ config, db });

  const loginRateLimiter = rateLimit({
    windowMs: config.authLoginRateLimitWindowMs || 15 * 60 * 1000,
    limit: config.authLoginRateLimitMax || 12,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    keyGenerator(req) {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "anon";
      return `${req.ip}:${email}`;
    }
  });
  const registerRateLimiter = rateLimit({
    windowMs: config.authRegisterRateLimitWindowMs || 15 * 60 * 1000,
    limit: config.authRegisterRateLimitMax || 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    keyGenerator(req) {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "anon";
      return `${req.ip}:register:${email}`;
    }
  });

  router.post(
    "/register",
    registerRateLimiter,
    asyncHandler(async (req, res) => {
      const result = await authService.register(req.body || {});
      res.status(201).json(result);
    })
  );

  router.post(
    "/login",
    loginRateLimiter,
    asyncHandler(async (req, res) => {
      const result = await authService.login(req.body || {});
      res.status(200).json(result);
    })
  );

  router.post(
    "/google",
    loginRateLimiter,
    asyncHandler(async (req, res) => {
      const result = await authService.loginWithGoogle(req.body || {});
      res.status(200).json(result);
    })
  );

  router.post(
    "/refresh",
    loginRateLimiter,
    asyncHandler(async (req, res) => {
      const result = await authService.refresh(req.body || {});
      res.status(200).json(result);
    })
  );

  router.post(
    "/logout",
    loginRateLimiter,
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
