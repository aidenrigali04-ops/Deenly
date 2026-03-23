const pino = require("pino");

function createLogger(config) {
  return pino({
    level: config.logLevel,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
  });
}

module.exports = {
  createLogger
};
