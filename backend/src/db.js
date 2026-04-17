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

  /**
   * Run callback with a dedicated client and a single transaction (BEGIN/COMMIT/ROLLBACK).
   * Use this instead of pool.query("BEGIN") so all statements share one connection.
   */
  async function withTransaction(callback) {
    if (!pool) {
      const error = new Error("Database is not configured");
      error.statusCode = 503;
      throw error;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore rollback errors */
      }
      throw err;
    } finally {
      client.release();
    }
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
    withTransaction,
    checkConnection,
    close
  };
}

module.exports = { createDb };
