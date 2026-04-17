const dotenv = require("dotenv");
const { loadEnv } = require("./config/env");
const { createLogger } = require("./config/logger");
const { createDb } = require("./db");
const { createApp } = require("./app");
const { createAnalytics } = require("./services/analytics");
const { createMediaStorage } = require("./services/media-storage");
const { createPushNotifications } = require("./services/push-notifications");
const { createMonetizationGateway } = require("./services/monetization-gateway");
const { createRewardsLedgerService } = require("./modules/rewards/rewards-ledger-service");
const { createRewardsCheckoutService } = require("./modules/rewards/rewards-checkout-service");
const { createReferralRepository } = require("./modules/referrals/referral-repository");
const { createReferralService } = require("./modules/referrals/referral-service");
const { getReferralDomainConfig } = require("./modules/referrals/referral-config");
const { createRewardsReadService } = require("./modules/rewards/rewards-read-service");
const { createReferralReadService } = require("./modules/referrals/referral-read-service");
const { createTrustFlagService } = require("./modules/trust/create-trust-flag-service");

dotenv.config();

const config = loadEnv(process.env);
const logger = createLogger(config);
const db = createDb(config);
const analytics = createAnalytics({ db, logger });
const mediaStorage = createMediaStorage(config);
const pushNotifications = createPushNotifications({ db, logger });
const monetizationGateway = createMonetizationGateway({ config });

const trustFlagService = createTrustFlagService({ db, analytics, logger });

const rewardsLedgerService = createRewardsLedgerService({
  db,
  analytics,
  logger,
  repository: undefined,
  trustFlagService,
  appConfig: config
});

const rewardsCheckoutService = createRewardsCheckoutService({
  db,
  rewardsLedgerService,
  config,
  logger
});

const referralRepository = createReferralRepository();

let referralService = null;
if (config.referralsEnabled && config.databaseUrl) {
  referralService = createReferralService({
    db,
    repository: referralRepository,
    rewardsLedger: rewardsLedgerService,
    analytics,
    logger,
    appConfig: config,
    getReferralConfig: getReferralDomainConfig,
    trustFlagService
  });
}

const rewardsReadService = createRewardsReadService({
  db,
  rewardsLedgerService,
  config,
  analytics,
  logger
});

let referralReadService = null;
if (config.referralsEnabled && config.databaseUrl && referralService) {
  referralReadService = createReferralReadService({
    db,
    referralRepository,
    referralService,
    appConfig: config,
    analytics,
    logger
  });
}

const app = createApp({
  config,
  logger,
  db,
  analytics,
  mediaStorage,
  pushNotifications,
  monetizationGateway,
  referralService,
  rewardsLedgerService,
  rewardsCheckoutService,
  rewardsReadService,
  referralReadService,
  trustFlagService
});

const listenHost = process.env.BIND_HOST || "0.0.0.0";
const server = app.listen(config.port, listenHost, () => {
  logger.info({ port: config.port, host: listenHost }, "server_started");
});

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
