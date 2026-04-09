const crypto = require("crypto");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pinoHttp = require("pino-http");
const { asyncHandler } = require("./utils/async-handler");
const { errorHandler, notFoundHandler } = require("./middleware/error-handler");
const { createAuthRouter } = require("./modules/auth/routes");
const { createProfileRouter } = require("./modules/profiles/routes");
const { createUsersRouter } = require("./modules/users/routes");
const { createPostsRouter } = require("./modules/posts/routes");
const { createFeedRouter } = require("./modules/feed/routes");
const { createInteractionsRouter } = require("./modules/interactions/routes");
const { createFollowsRouter } = require("./modules/follows/routes");
const { createMediaRouter } = require("./modules/media/routes");
const { createReportsRouter } = require("./modules/reports/routes");
const { createSafetyRouter } = require("./modules/safety/routes");
const { createAnalyticsRouter } = require("./modules/analytics/routes");
const { createNotificationsRouter } = require("./modules/notifications/routes");
const { createMessagesRouter } = require("./modules/messages/routes");
const { createSearchRouter } = require("./modules/search/routes");
const { createAdminRouter } = require("./modules/admin/routes");
const { createBetaRouter } = require("./modules/beta/routes");
const { createSupportRouter } = require("./modules/support/routes");
const { createMonetizationRouter } = require("./modules/monetization/routes");
const { createAdsRouter } = require("./modules/ads/routes");
const { createCreatorRouter } = require("./modules/creator/routes");
const { createInstagramRouter } = require("./modules/instagram/routes");
const { createAiRouter } = require("./modules/ai/routes");
const { createBusinessesRouter } = require("./modules/businesses/routes");
const { createEventsRouter } = require("./modules/events/routes");
const { createGeocodeRouter } = require("./modules/geocode/routes");
const { createInstagramCrossPostOrchestrator } = require("./services/instagram-graph");
const { createMetrics } = require("./observability/metrics");
const { createMonetizationGateway } = require("./services/monetization-gateway");
const { createPlaidSellerBankService } = require("./services/plaid-seller-bank");
const { authenticate, authorize } = require("./middleware/auth");
const { httpError } = require("./utils/http-error");

function createCorsOptions(config) {
  if (config.corsOrigins.length === 0) {
    if (config.isProduction) {
      return { origin: false };
    }
    return { origin: true };
  }

  return {
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      const error = new Error("CORS origin denied");
      error.statusCode = 403;
      callback(error);
    }
  };
}

function createApp({
  config,
  logger,
  db,
  analytics,
  mediaStorage,
  pushNotifications,
  monetizationGateway
}) {
  function requireAdminOwner(req, _res, next) {
    const ownerEmail = String(config.adminOwnerEmail || "").toLowerCase();
    if (!ownerEmail) {
      return next(httpError(503, "ADMIN_OWNER_EMAIL is not configured"));
    }
    const requesterEmail = String(req.user?.email || "").toLowerCase();
    if (requesterEmail !== ownerEmail) {
      return next(httpError(403, "Admin access is restricted"));
    }
    return next();
  }

  const app = express();
  const metrics = createMetrics();
  app.locals.analytics = analytics || null;
  app.locals.mediaStorage = mediaStorage;
  app.locals.pushNotifications = pushNotifications || null;
  app.locals.monetizationGateway = monetizationGateway || createMonetizationGateway({ config });
  app.locals.plaidSellerBank = createPlaidSellerBankService({ db, config, logger });

  const instagramCrossPost = createInstagramCrossPostOrchestrator({
    db,
    config,
    mediaStorage
  });

  if (config.trustProxy) {
    app.set("trust proxy", 1);
  }

  app.use(
    pinoHttp({
      logger,
      genReqId(req, res) {
        const id = req.headers["x-request-id"] || crypto.randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      }
    })
  );

  app.use(helmet());
  app.use(cors(createCorsOptions(config)));
  const rateLimitSkipTestOrStripe = (req) => {
    if (process.env.NODE_ENV === "test") {
      return true;
    }
    const url = String(req.originalUrl || req.url || req.path || "");
    return url.includes("/monetization/webhooks/stripe");
  };

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
      skip: rateLimitSkipTestOrStripe
    })
  );

  const feedReadLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 90,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test"
  });
  const searchReadLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test"
  });
  const aiWriteLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 24,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test"
  });
  app.use(
    express.json({
      limit: "1mb",
      verify(req, _res, buf) {
        req.rawBody = buf;
      }
    })
  );
  app.use(metrics.middleware());

  app.get(
    "/health",
    asyncHandler(async (_req, res) => {
      const body = {
        status: "ok",
        service: "deenly-backend",
        timestamp: new Date().toISOString()
      };
      if (!config.isProduction) {
        body.databaseConfigured = Boolean(config.databaseUrl);
        body.stripeConfigured = Boolean(config.stripeSecretKey && config.stripeWebhookSecret);
      }
      res.status(200).json(body);
    })
  );

  app.get(
    "/health/db",
    asyncHandler(async (_req, res) => {
      const health = await db.checkConnection();
      const statusCode = health.ok ? 200 : 503;
      res.status(statusCode).json({
        status: health.ok ? "ok" : "error",
        service: "deenly-backend",
        database: health
      });
    })
  );

  app.get(
    "/ready",
    asyncHandler(async (_req, res) => {
      if (!config.databaseUrl) {
        return res.status(200).json({
          status: "ok",
          ready: true,
          reason: "database_not_required"
        });
      }

      const health = await db.checkConnection();
      if (!health.ok) {
        return res.status(503).json({
          status: "error",
          ready: false,
          database: health
        });
      }

      return res.status(200).json({
        status: "ok",
        ready: true
      });
    })
  );

  app.get("/", (_req, res) => {
    res.status(200).json({
      message: "Deenly backend is running",
      docs: "Start building API routes under /api"
    });
  });

  app.put("/mock-upload/*", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  const apiRouter = express.Router();
  apiRouter.use("/auth", createAuthRouter({ config, db, analytics: app.locals.analytics }));
  apiRouter.use("/users", createUsersRouter({ db, config, analytics: app.locals.analytics }));
  apiRouter.use("/profiles", createProfileRouter({ db, config }));
  apiRouter.use(
    "/posts",
    createPostsRouter({
      db,
      config,
      analytics: app.locals.analytics,
      mediaStorage: app.locals.mediaStorage,
      enqueueInstagramCrossPost: instagramCrossPost.enqueueAfterCreatePost
    })
  );
  apiRouter.use(
    "/instagram",
    createInstagramRouter({
      db,
      config,
      enqueueInstagramCrossPostByPostId: instagramCrossPost.enqueueByPostId
    })
  );
  apiRouter.use("/feed", feedReadLimiter, createFeedRouter({ db, config, mediaStorage: app.locals.mediaStorage }));
  apiRouter.use(
    "/interactions",
    createInteractionsRouter({
      db,
      config,
      analytics: app.locals.analytics,
      pushNotifications: app.locals.pushNotifications
    })
  );
  apiRouter.use(
    "/follows",
    createFollowsRouter({
      db,
      config,
      analytics: app.locals.analytics,
      pushNotifications: app.locals.pushNotifications
    })
  );
  apiRouter.use("/media", createMediaRouter({ db, config, mediaStorage: app.locals.mediaStorage, analytics: app.locals.analytics }));
  apiRouter.use("/reports", createReportsRouter({ db, config, analytics: app.locals.analytics }));
  apiRouter.use("/safety", createSafetyRouter({ db, config }));
  apiRouter.use("/analytics", createAnalyticsRouter({ db, config }));
  apiRouter.use(
    "/notifications",
    createNotificationsRouter({ db, config, pushNotifications: app.locals.pushNotifications })
  );
  apiRouter.use(
    "/messages",
    createMessagesRouter({ db, config, pushNotifications: app.locals.pushNotifications })
  );
  apiRouter.use("/search", searchReadLimiter, createSearchRouter({ db, config }));
  apiRouter.use(
    "/admin",
    authenticate({ config, db }),
    authorize(["moderator", "admin"]),
    requireAdminOwner,
    createAdminRouter({ db, config, pushNotifications: app.locals.pushNotifications })
  );
  apiRouter.use("/beta", createBetaRouter({ db, config }));
  apiRouter.use("/support", createSupportRouter({ db, config }));
  apiRouter.use(
    "/monetization",
    createMonetizationRouter({
      db,
      config,
      logger,
      monetizationGateway: app.locals.monetizationGateway,
      mediaStorage: app.locals.mediaStorage,
      analytics: app.locals.analytics,
      plaidSellerBank: app.locals.plaidSellerBank,
      pushNotifications: app.locals.pushNotifications
    })
  );
  apiRouter.use(
    "/ads",
    createAdsRouter({
      db,
      config,
      analytics: app.locals.analytics,
      monetizationGateway: app.locals.monetizationGateway
    })
  );
  apiRouter.use("/creator", createCreatorRouter({ db, config, mediaStorage: app.locals.mediaStorage }));
  apiRouter.use("/businesses", createBusinessesRouter({ db, config }));
  apiRouter.use(
    "/events",
    createEventsRouter({
      db,
      config,
      analytics: app.locals.analytics,
      pushNotifications: app.locals.pushNotifications
    })
  );
  apiRouter.use("/geocode", createGeocodeRouter());
  apiRouter.use("/ai", aiWriteLimiter, createAiRouter({ config, db, logger }));

  app.use("/api", apiRouter);
  app.use("/api/v1", apiRouter);

  const authMiddleware = authenticate({ config, db });
  const modGuard = authorize(["moderator", "admin"]);
  app.get(
    "/ops/metrics",
    authMiddleware,
    modGuard,
    asyncHandler(async (_req, res) => {
      res.status(200).json(metrics.snapshot());
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}

module.exports = {
  createApp
};
