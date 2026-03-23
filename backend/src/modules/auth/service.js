const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const { httpError } = require("../../utils/http-error");
const { requireString } = require("../../utils/validators");

function issueTokens(config, user) {
  const accessToken = jwt.sign(
    { role: user.role },
    config.jwtAccessSecret || "dev-access-secret",
    {
      subject: String(user.id),
      expiresIn: config.jwtAccessTtl
    }
  );

  const refreshToken = jwt.sign(
    { role: user.role, tokenType: "refresh" },
    config.jwtRefreshSecret || "dev-refresh-secret",
    {
      subject: String(user.id),
      expiresIn: config.jwtRefreshTtl
    }
  );

  return { accessToken, refreshToken };
}

function ttlIntervalExpr(ttlValue) {
  const ttl = String(ttlValue || "30d").trim();
  const match = ttl.match(/^(\d+)\s*([smhdw])$/i);
  if (!match) {
    return "30 days";
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const unitMap = {
    s: "seconds",
    m: "minutes",
    h: "hours",
    d: "days",
    w: "weeks"
  };

  return `${amount} ${unitMap[unit]}`;
}

function createAuthService({ db, config, analytics }) {
  const refreshInterval = ttlIntervalExpr(config.jwtRefreshTtl);

  async function register(input) {
    const email = requireString(input.email, "email", 5, 254).toLowerCase();
    const password = requireString(input.password, "password", 8, 128);
    const displayName = requireString(input.displayName, "displayName", 2, 64);

    const passwordHash = await argon2.hash(password);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'user')
       RETURNING id, email, role, created_at`,
      [email, passwordHash]
    );

    const user = result.rows[0];
    await db.query(
      `INSERT INTO profiles (user_id, display_name)
       VALUES ($1, $2)`,
      [user.id, displayName]
    );

    const tokens = issueTokens(config, user);
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + $3::interval)`,
      [user.id, await argon2.hash(tokens.refreshToken), refreshInterval]
    );
    if (analytics) {
      await analytics.trackEvent("signup", { userId: user.id });
    }

    return {
      user,
      tokens
    };
  }

  async function login(input) {
    const email = requireString(input.email, "email", 5, 254).toLowerCase();
    const password = requireString(input.password, "password", 8, 128);

    const result = await db.query(
      `SELECT id, email, role, password_hash, is_active, created_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (result.rowCount === 0 || !result.rows[0].is_active) {
      throw httpError(401, "Invalid email or password");
    }

    const user = result.rows[0];
    const validPassword = await argon2.verify(user.password_hash, password);
    if (!validPassword) {
      throw httpError(401, "Invalid email or password");
    }

    const tokens = issueTokens(config, user);
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + $3::interval)`,
      [user.id, await argon2.hash(tokens.refreshToken), refreshInterval]
    );
    if (analytics) {
      await analytics.trackEvent("auth_login", { userId: user.id });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        created_at: user.created_at
      },
      tokens
    };
  }

  async function refresh(input) {
    const refreshToken = requireString(input.refreshToken, "refreshToken", 20, 4096);
    let payload;
    try {
      payload = jwt.verify(
        refreshToken,
        config.jwtRefreshSecret || "dev-refresh-secret"
      );
    } catch {
      throw httpError(401, "Invalid refresh token");
    }

    const userId = Number(payload.sub);
    if (!userId) {
      throw httpError(401, "Invalid refresh token");
    }

    const tokenResult = await db.query(
      `SELECT id, token_hash
       FROM refresh_tokens
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    );

    let validTokenId = null;
    for (const row of tokenResult.rows) {
      const matches = await argon2.verify(row.token_hash, refreshToken);
      if (matches) {
        validTokenId = row.id;
        break;
      }
    }

    if (!validTokenId) {
      throw httpError(401, "Invalid refresh token");
    }

    const userResult = await db.query(
      `SELECT id, email, role, is_active, created_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    if (userResult.rowCount === 0 || !userResult.rows[0].is_active) {
      throw httpError(401, "Invalid refresh token");
    }

    const user = userResult.rows[0];
    await db.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE id = $1`,
      [validTokenId]
    );

    const tokens = issueTokens(config, user);
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + $3::interval)`,
      [user.id, await argon2.hash(tokens.refreshToken), refreshInterval]
    );

    return { tokens };
  }

  async function logout(input) {
    const refreshToken = requireString(input.refreshToken, "refreshToken", 20, 4096);
    let payload;
    try {
      payload = jwt.verify(
        refreshToken,
        config.jwtRefreshSecret || "dev-refresh-secret"
      );
    } catch {
      return { success: true };
    }

    const userId = Number(payload.sub);
    if (!userId) {
      return { success: true };
    }

    const tokenResult = await db.query(
      `SELECT id, token_hash
       FROM refresh_tokens
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    );

    for (const row of tokenResult.rows) {
      const matches = await argon2.verify(row.token_hash, refreshToken);
      if (matches) {
        await db.query(
          `UPDATE refresh_tokens
           SET revoked_at = NOW()
           WHERE id = $1`,
          [row.id]
        );
        break;
      }
    }

    return { success: true };
  }

  return {
    register,
    login,
    refresh,
    logout
  };
}

module.exports = {
  createAuthService
};
