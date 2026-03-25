const DEFAULT_PORT = 3000;
const { URL } = require("node:url");
const VALID_NODE_ENVS = new Set(["development", "test", "production"]);
const VALID_DB_SSL_MODES = new Set(["disable", "require", "no-verify"]);
const VALID_MEDIA_PROVIDERS = new Set(["mock", "s3"]);

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

function parseNumber(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Invalid numeric value in environment configuration");
  }
  return parsed;
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseOptionalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("MEDIA_PUBLIC_BASE_URL must be a valid absolute URL");
  }
  return parsed.toString().replace(/\/+$/, "");
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
    trustProxy: parseBoolean(envSource.TRUST_PROXY, false),
    adminOwnerEmail: String(envSource.ADMIN_OWNER_EMAIL || "").trim().toLowerCase(),
    processingWebhookToken: envSource.PROCESSING_WEBHOOK_TOKEN || "",
    mediaProvider: envSource.MEDIA_PROVIDER || "mock",
    mediaMaxUploadBytes: parseNumber(envSource.MEDIA_MAX_UPLOAD_BYTES, 100 * 1024 * 1024),
    mediaAllowedMimeTypes: parseList(
      envSource.MEDIA_ALLOWED_MIME_TYPES ||
        "video/mp4,video/quicktime,audio/mpeg,audio/wav,image/jpeg,image/png"
    ),
    awsRegion: envSource.AWS_REGION || "",
    awsS3Bucket: envSource.AWS_S3_BUCKET || "",
    mediaPublicBaseUrl: parseOptionalUrl(envSource.MEDIA_PUBLIC_BASE_URL),
    googleClientId: String(envSource.GOOGLE_CLIENT_ID || "").trim(),
    commentBlockedTerms: parseList(envSource.COMMENT_BLOCKED_TERMS),
    mockUploadBaseUrl: envSource.MOCK_UPLOAD_BASE_URL || ""
  };

  if (!VALID_DB_SSL_MODES.has(config.dbSslMode)) {
    throw new Error("DB_SSL_MODE must be disable, require, or no-verify");
  }
  if (!VALID_MEDIA_PROVIDERS.has(config.mediaProvider)) {
    throw new Error("MEDIA_PROVIDER must be mock or s3");
  }
  if (config.mediaProvider === "s3") {
    if (!config.awsRegion) {
      throw new Error("AWS_REGION is required when MEDIA_PROVIDER=s3");
    }
    if (!config.awsS3Bucket) {
      throw new Error("AWS_S3_BUCKET is required when MEDIA_PROVIDER=s3");
    }
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
    if (!config.adminOwnerEmail) {
      throw new Error("ADMIN_OWNER_EMAIL is required in production");
    }
  }

  return config;
}

module.exports = {
  loadEnv
};
