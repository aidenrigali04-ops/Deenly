const dotenv = require("dotenv");
const { loadEnv } = require("./config/env");
const { createLogger } = require("./config/logger");
const { createDb } = require("./db");
const { createApp } = require("./app");
const { createAnalytics } = require("./services/analytics");
const { createMediaStorage } = require("./services/media-storage");
const { createPushNotifications } = require("./services/push-notifications");
const { createMonetizationGateway } = require("./services/monetization-gateway");
const { createRewardJobs } = require("./cron/reward-jobs");

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

// Preload rewards config cache and start background jobs.
const rewardJobs = createRewardJobs({
  logger,
  streakService: app.locals.streakService,
  tierService: app.locals.tierService,
  referralService: app.locals.referralService,
  boostService: app.locals.boostService,
  challengeService: app.locals.challengeService,
  trustService: app.locals.trustService,
  config,
});
if (app.locals.rewardConfig && typeof app.locals.rewardConfig.preload === "function") {
  app.locals.rewardConfig.preload().catch((err) => {
    logger.error({ err }, "reward_config.preload_failed");
  });
}
rewardJobs.start();

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, "server_shutdown_started");

  try {
    rewardJobs.stop();
  } catch (err) {
    logger.warn({ err }, "reward_jobs.stop_failed");
  }

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "server_close_failed");
      process.exit(1);
      return;
    }

    try {
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
