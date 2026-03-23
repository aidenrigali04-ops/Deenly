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
const { createPostsRouter } = require("./modules/posts/routes");
const { createFeedRouter } = require("./modules/feed/routes");
const { createInteractionsRouter } = require("./modules/interactions/routes");
const { createFollowsRouter } = require("./modules/follows/routes");

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

function createApp({ config, logger, db }) {
  const app = express();

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
  app.use(express.json({ limit: "1mb" }));

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

  app.use("/api/auth", createAuthRouter({ config, db }));
  app.use("/api/profiles", createProfileRouter({ db, config }));
  app.use("/api/posts", createPostsRouter({ db, config }));
  app.use("/api/feed", createFeedRouter({ db }));
  app.use("/api/interactions", createInteractionsRouter({ db, config }));
  app.use("/api/follows", createFollowsRouter({ db, config }));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}

module.exports = {
  createApp
};
