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
const { createMetrics } = require("./observability/metrics");
const { createMonetizationGateway } = require("./services/monetization-gateway");
const { authenticate, authorize } = require("./middleware/auth");
const { httpError } = require("./utils/http-error");

function createCorsOptions(config) {
  if (config.corsOrigins.length === 0) {
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
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false
    })
  );
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
      res.status(200).json({
        status: "ok",
        service: "deenly-backend",
        databaseConfigured: Boolean(config.databaseUrl),
        timestamp: new Date().toISOString()
      });
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
  apiRouter.use("/users", createUsersRouter({ db, config }));
  apiRouter.use("/profiles", createProfileRouter({ db, config }));
  apiRouter.use(
    "/posts",
    createPostsRouter({ db, config, analytics: app.locals.analytics, mediaStorage: app.locals.mediaStorage })
  );
  apiRouter.use("/feed", createFeedRouter({ db, config, mediaStorage: app.locals.mediaStorage }));
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
  apiRouter.use("/messages", createMessagesRouter({ db, config }));
  apiRouter.use("/search", createSearchRouter({ db, config }));
  apiRouter.use(
    "/admin",
    authenticate({ config, db }),
    authorize(["moderator", "admin"]),
    requireAdminOwner,
    createAdminRouter({ db, config })
  );
  apiRouter.use("/beta", createBetaRouter({ db, config }));
  apiRouter.use("/support", createSupportRouter({ db, config }));
  apiRouter.use(
    "/monetization",
    createMonetizationRouter({
      db,
      config,
      monetizationGateway: app.locals.monetizationGateway,
      mediaStorage: app.locals.mediaStorage,
      analytics: app.locals.analytics
    })
  );
  apiRouter.use("/ads", createAdsRouter({ db, config, analytics: app.locals.analytics }));
  apiRouter.use("/creator", createCreatorRouter({ db, config, mediaStorage: app.locals.mediaStorage }));

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
