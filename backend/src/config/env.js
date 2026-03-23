const DEFAULT_PORT = 3000;
const VALID_NODE_ENVS = new Set(["development", "test", "production"]);
const VALID_DB_SSL_MODES = new Set(["disable", "require", "no-verify"]);

function parsePort(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_PORT;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return parsed;
}

function parseCorsOrigins(value, nodeEnv) {
  const raw = value || "";
  const list = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (nodeEnv === "production" && list.length === 0) {
    throw new Error(
      "CORS_ORIGINS is required in production (comma-separated origins)"
    );
  }

  return list;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).toLowerCase() === "true";
}

function loadEnv(envSource = process.env) {
  const nodeEnv = envSource.NODE_ENV || "development";
  if (!VALID_NODE_ENVS.has(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  const config = {
    nodeEnv,
    isProduction: nodeEnv === "production",
    isTest: nodeEnv === "test",
    port: parsePort(envSource.PORT),
    databaseUrl: envSource.DATABASE_URL || "",
    dbSslMode: envSource.DB_SSL_MODE || "require",
    corsOrigins: parseCorsOrigins(envSource.CORS_ORIGINS, nodeEnv),
    jwtAccessSecret: envSource.JWT_ACCESS_SECRET || "",
    jwtRefreshSecret: envSource.JWT_REFRESH_SECRET || "",
    jwtAccessTtl: envSource.JWT_ACCESS_TTL || "15m",
    jwtRefreshTtl: envSource.JWT_REFRESH_TTL || "30d",
    logLevel: envSource.LOG_LEVEL || "info",
    trustProxy: parseBoolean(envSource.TRUST_PROXY, false)
  };

  if (!VALID_DB_SSL_MODES.has(config.dbSslMode)) {
    throw new Error("DB_SSL_MODE must be disable, require, or no-verify");
  }

  if (config.isProduction && !config.databaseUrl) {
    throw new Error("DATABASE_URL is required in production");
  }

  if (config.isProduction) {
    if (!config.jwtAccessSecret) {
      throw new Error("JWT_ACCESS_SECRET is required in production");
    }
    if (!config.jwtRefreshSecret) {
      throw new Error("JWT_REFRESH_SECRET is required in production");
    }
  }

  return config;
}

module.exports = {
  loadEnv
};
