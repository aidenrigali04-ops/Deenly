const dotenv = require("dotenv");
const { loadEnv } = require("./config/env");
const { createLogger } = require("./config/logger");
const { createDb } = require("./db");
const { createApp } = require("./app");
const { createAnalytics } = require("./services/analytics");
const { createMediaStorage } = require("./services/media-storage");
const { createPushNotifications } = require("./services/push-notifications");
const { createMonetizationGateway } = require("./services/monetization-gateway");
const { createWebSocketService } = require("./services/websocket");

dotenv.config();

const config = loadEnv(process.env);
const logger = createLogger(config);
const db = createDb(config);
const analytics = createAnalytics({ db, logger });
const mediaStorage = createMediaStorage(config);
const pushNotifications = createPushNotifications({ db, logger });
const monetizationGateway = createMonetizationGateway({ config });
const app = createApp({
  config,
  logger,
  db,
  analytics,
  mediaStorage,
  pushNotifications,
  monetizationGateway
});

const listenHost = process.env.BIND_HOST || "0.0.0.0";
const server = app.listen(config.port, listenHost, () => {
  logger.info({ port: config.port, host: listenHost }, "server_started");
});

const wsService = createWebSocketService({ server, config, db, logger });
app.locals.wsService = wsService;

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, "server_shutdown_started");

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "server_close_failed");
      process.exit(1);
      return;
    }

    try {
      wsService.close();
      await db.close();
      logger.info("server_shutdown_complete");
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "db_shutdown_failed");
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error("forced_shutdown_timeout");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
