const crypto = require("node:crypto");
const argon2 = require("argon2");
const { httpError } = require("../utils/http-error");

const GUEST_USERNAME = "deenly_guest";
const GUEST_EMAIL = "deenly.guest.poster@internal.invalid";
const GUEST_DISPLAY_NAME = "Guest";

/**
 * User id for unauthenticated writes (posts, media, onboarding interests/preferences).
 * Uses ANONYMOUS_POSTING_USER_ID when set, otherwise lazy-creates internal user `deenly_guest`.
 */
async function getAnonymousPostingUserId(db, config) {
  if (config.anonymousPostingUserId != null) {
    const check = await db.query(
      `SELECT id FROM users WHERE id = $1 AND is_active = true LIMIT 1`,
      [config.anonymousPostingUserId]
    );
    if (check.rowCount === 0) {
      throw httpError(500, "ANONYMOUS_POSTING_USER_ID does not match an active user");
    }
    return config.anonymousPostingUserId;
  }

  const found = await db.query(`SELECT id FROM users WHERE username = $1 LIMIT 1`, [GUEST_USERNAME]);
  if (found.rowCount > 0) {
    return found.rows[0].id;
  }

  const hash = await argon2.hash(crypto.randomBytes(32).toString("hex"), { type: argon2.argon2id });
  try {
    const ins = await db.query(
      `INSERT INTO users (email, username, password_hash, role) VALUES ($1, $2, $3, 'user') RETURNING id`,
      [GUEST_EMAIL, GUEST_USERNAME, hash]
    );
    const id = ins.rows[0].id;
    await db.query(`INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`, [id, GUEST_DISPLAY_NAME]);
    return id;
  } catch (e) {
    if (e.code === "23505") {
      const again = await db.query(`SELECT id FROM users WHERE username = $1 LIMIT 1`, [GUEST_USERNAME]);
      if (again.rowCount > 0) {
        return again.rows[0].id;
      }
    }
    throw e;
  }
}

async function resolvePostAuthorUserId(req, db, config) {
  if (req.user) {
    return req.user.id;
  }
  return getAnonymousPostingUserId(db, config);
}

module.exports = {
  getAnonymousPostingUserId,
  resolvePostAuthorUserId,
  GUEST_USERNAME,
  GUEST_EMAIL
};
