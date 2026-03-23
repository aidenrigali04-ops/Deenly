const { Pool } = require("pg");

function resolveSslConfig(dbSslMode) {
  if (dbSslMode === "disable") {
    return false;
  }

  if (dbSslMode === "no-verify") {
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: true };
}

function createDb(config) {
  const connectionString = config.databaseUrl;
  let pool = null;

  if (connectionString) {
    pool = new Pool({
      connectionString,
      ssl: resolveSslConfig(config.dbSslMode)
    });
  }

  async function checkConnection() {
    if (!pool) {
      return { ok: false, reason: "DATABASE_URL is not set" };
    }

    try {
      const result = await pool.query("SELECT NOW() AS now");
      return { ok: true, now: result.rows[0].now };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  async function query(text, params = []) {
    if (!pool) {
      const error = new Error("Database is not configured");
      error.statusCode = 503;
      throw error;
    }

    return pool.query(text, params);
  }

  async function close() {
    if (!pool) {
      return;
    }
    await pool.end();
  }

  return {
    pool,
    query,
    checkConnection,
    close
  };
}

module.exports = { createDb };
