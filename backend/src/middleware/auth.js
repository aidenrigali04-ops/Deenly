const jwt = require("jsonwebtoken");
const { httpError } = require("../utils/http-error");

function requireAccessSecret(config) {
  const secret = config?.jwtAccessSecret;
  if (!secret) {
    throw httpError(500, "JWT access secret is not configured");
  }
  return secret;
}

function authenticate({ config, db }) {
  return async (req, _res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";

    if (!token) {
      return next(httpError(401, "Authentication required"));
    }

    try {
      const payload = jwt.verify(token, requireAccessSecret(config));
      const result = await db.query(
        "SELECT id, email, username, role, is_active, created_at FROM users WHERE id = $1 LIMIT 1",
        [payload.sub]
      );

      if (result.rowCount === 0 || !result.rows[0].is_active) {
        return next(httpError(401, "Invalid authentication token"));
      }

      req.user = result.rows[0];
      return next();
    } catch {
      return next(httpError(401, "Invalid authentication token"));
    }
  };
}

function authorize(allowedRoles) {
  return (req, _res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(httpError(403, "Insufficient permissions"));
    }
    return next();
  };
}

module.exports = {
  authenticate,
  authorize,
  requireAccessSecret
};
