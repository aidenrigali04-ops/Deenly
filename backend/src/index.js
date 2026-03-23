const dotenv = require("dotenv");
const { loadEnv } = require("./config/env");
const { createLogger } = require("./config/logger");
const { createDb } = require("./db");
const { createApp } = require("./app");

dotenv.config();

const config = loadEnv(process.env);
const logger = createLogger(config);
const db = createDb(config);
const app = createApp({ config, logger, db });

app.listen(config.port, () => {
  logger.info({ port: config.port }, "server_started");
});
