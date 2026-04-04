const argon2 = require("argon2");
const { randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { httpError } = require("../../utils/http-error");
const { optionalString, optionalWebsiteUrl, requireString } = require("../../utils/validators");
const { throwIfAnyUserFacingPolicyViolation, throwIfUserFacingPolicyViolation } = require("../../utils/content-safety");

function requireRefreshSecret(config) {
  const secret = config?.jwtRefreshSecret;
  if (!secret) {
    throw httpError(500, "JWT refresh secret is not configured");
  }
  return secret;
}

function issueTokens(config, user) {
  if (!config?.jwtAccessSecret) {
    throw httpError(500, "JWT access secret is not configured");
  }
  const accessToken = jwt.sign(
    { role: user.role },
    config.jwtAccessSecret,
    {
      subject: String(user.id),
      expiresIn: config.jwtAccessTtl
    }
  );

  const refreshToken = jwt.sign(
    { role: user.role, tokenType: "refresh" },
    requireRefreshSecret(config),
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

  async function trackAuthFailure(reason, metadata = {}) {
    if (!analytics) {
      return;
    }
    await analytics.trackEvent("auth_failure", {
      reason,
      ...metadata
    });
  }

  function extractEmailDomain(email) {
    const value = String(email || "");
    const parts = value.split("@");
    return parts.length === 2 ? parts[1] : null;
  }

  function normalizeUsernameBase(rawValue) {
    return String(rawValue || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
  }

  function normalizeUsername(rawValue) {
    const username = requireString(rawValue, "username", 3, 32).toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
      throw httpError(
        400,
        "username must be 3-32 chars and only contain lowercase letters, numbers, or underscore"
      );
    }
    return username;
  }

  async function reserveAvailableUsername(rawValue) {
    const normalizedBase = normalizeUsernameBase(rawValue);
    const base = normalizedBase.length >= 3 ? normalizedBase.slice(0, 24) : "deenly_user";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const suffix = attempt === 0 ? "" : `_${(attempt + 1).toString()}`;
      const candidate = `${base}${suffix}`.slice(0, 32);
      if (!/^[a-z0-9_]{3,32}$/.test(candidate)) {
        continue;
      }
      const existing = await db.query("SELECT id FROM users WHERE username = $1 LIMIT 1", [candidate]);
      if (existing.rowCount === 0) {
        return candidate;
      }
    }
    return `deenly_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  }

  async function issueSessionTokens(user, analyticsEventName) {
    const tokens = issueTokens(config, user);
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + $3::interval)`,
      [user.id, await argon2.hash(tokens.refreshToken), refreshInterval]
    );
    if (analytics && analyticsEventName) {
      await analytics.trackEvent(analyticsEventName, { userId: user.id });
    }
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.created_at
      },
      tokens
    };
  }

  async function register(input) {
    const email = requireString(input.email, "email", 5, 254).toLowerCase();
    const password = requireString(input.password, "password", 8, 128);
    const displayName = requireString(input.displayName, "displayName", 2, 64);
    const username = normalizeUsername(input.username);
    const businessOffering = optionalString(input.businessOffering, "businessOffering", 2000);
    const websiteUrl = optionalWebsiteUrl(input.websiteUrl, "websiteUrl", 2048);

    throwIfAnyUserFacingPolicyViolation(
      [displayName, username, businessOffering, websiteUrl],
      config,
      {
        termMessage: "Registration contains blocked language",
        urlMessage: "Registration links to a blocked website"
      }
    );

    const role =
      config.adminOwnerEmail && email === String(config.adminOwnerEmail).toLowerCase()
        ? "admin"
        : "user";

    const passwordHash = await argon2.hash(password);
    let result;
    try {
      result = await db.query(
        `INSERT INTO users (email, username, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, username, role, created_at`,
        [email, username, passwordHash, role]
      );
    } catch (error) {
      if (error.code === "23505") {
        await trackAuthFailure("register_conflict", {
          emailDomain: extractEmailDomain(email)
        });
        if (String(error.constraint || "").includes("email")) {
          throw httpError(409, "email is already in use");
        }
        if (String(error.constraint || "").includes("username")) {
          throw httpError(409, "username is already in use");
        }
        throw httpError(409, "account already exists");
      }
      throw error;
    }

    const user = result.rows[0];
    await db.query(
      `INSERT INTO profiles (user_id, display_name, business_offering, website_url)
       VALUES ($1, $2, $3, $4)`,
      [user.id, displayName, businessOffering, websiteUrl]
    );

    const session = await issueSessionTokens(user, "signup");
    return session;
  }

  async function login(input) {
    const email = requireString(input.email, "email", 5, 254).toLowerCase();
    const password = requireString(input.password, "password", 8, 128);

    const result = await db.query(
      `SELECT id, email, username, role, password_hash, is_active, created_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (result.rowCount === 0 || !result.rows[0].is_active) {
      await trackAuthFailure("login_unknown_or_inactive", {
        emailDomain: extractEmailDomain(email)
      });
      throw httpError(401, "Invalid email or password");
    }

    const user = result.rows[0];
    const validPassword = await argon2.verify(user.password_hash, password);
    if (!validPassword) {
      await trackAuthFailure("login_invalid_password", {
        userId: user.id
      });
      throw httpError(401, "Invalid email or password");
    }

    return issueSessionTokens(user, "auth_login");
  }

  async function loginWithGoogle(input) {
    const accessToken = requireString(input.accessToken, "accessToken", 20, 4096);
    if (!config.googleClientId) {
      throw httpError(503, "Google OAuth is not configured");
    }

    const tokenInfoResponse = await globalThis.fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!tokenInfoResponse.ok) {
      await trackAuthFailure("google_invalid_token");
      throw httpError(401, "Invalid Google access token");
    }
    const tokenInfo = await tokenInfoResponse.json();
    if (String(tokenInfo.aud || "") !== String(config.googleClientId)) {
      await trackAuthFailure("google_audience_mismatch");
      throw httpError(401, "Google token audience mismatch");
    }

    const profileResponse = await globalThis.fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!profileResponse.ok) {
      await trackAuthFailure("google_profile_fetch_failed");
      throw httpError(401, "Unable to load Google user profile");
    }
    const profile = await profileResponse.json();
    const email = String(profile.email || "").trim().toLowerCase();
    const emailVerified = Boolean(profile.email_verified);
    if (!email || !emailVerified) {
      await trackAuthFailure("google_email_unverified");
      throw httpError(401, "Google account email is not verified");
    }

    const existing = await db.query(
      `SELECT id, email, username, role, is_active, created_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (existing.rowCount > 0) {
      const user = existing.rows[0];
      if (!user.is_active) {
        await trackAuthFailure("google_account_inactive", { userId: user.id });
        throw httpError(403, "Account is not active");
      }
      return issueSessionTokens(user, "auth_login");
    }

    const displayNameSource = String(profile.name || "").trim();
    const displayName = displayNameSource || email.split("@")[0] || "Deenly User";
    const username = await reserveAvailableUsername(
      profile.preferred_username || displayName || email.split("@")[0]
    );
    throwIfUserFacingPolicyViolation(username, config, {
      termMessage: "Could not complete sign-in: chosen username is not allowed",
      urlMessage: "Could not complete sign-in: username contains a blocked website reference"
    });
    const role =
      config.adminOwnerEmail && email === String(config.adminOwnerEmail).toLowerCase()
        ? "admin"
        : "user";
    const randomPasswordHash = await argon2.hash(randomUUID());
    const created = await db.query(
      `INSERT INTO users (email, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, username, role, created_at`,
      [email, username, randomPasswordHash, role]
    );
    const user = created.rows[0];
    const profileDisplayName = displayName.slice(0, 64);
    throwIfUserFacingPolicyViolation(profileDisplayName, config, {
      termMessage: "Google profile name contains blocked language",
      urlMessage: "Google profile contains a blocked website link"
    });
    await db.query(
      `INSERT INTO profiles (user_id, display_name, avatar_url, business_offering, website_url)
       VALUES ($1, $2, $3, NULL, NULL)`,
      [user.id, profileDisplayName, profile.picture || null]
    );
    return issueSessionTokens(user, "signup");
  }

  async function refresh(input) {
    const refreshToken = requireString(input.refreshToken, "refreshToken", 20, 4096);
    let payload;
    try {
      payload = jwt.verify(refreshToken, requireRefreshSecret(config));
    } catch {
      throw httpError(401, "Invalid refresh token");
    }

    if (payload.tokenType !== "refresh") {
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
      `SELECT id, email, username, role, is_active, created_at
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
      payload = jwt.verify(refreshToken, requireRefreshSecret(config));
    } catch {
      return { success: true };
    }

    if (payload.tokenType !== "refresh") {
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
    loginWithGoogle,
    refresh,
    logout
  };
}

module.exports = {
  createAuthService
};
