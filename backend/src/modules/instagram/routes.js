const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const {
  isMetaConfigured,
  buildAuthorizeUrl,
  signOAuthState,
  verifyOAuthState,
  persistConnectionFromOAuthCode,
  normalizeAppBase
} = require("../../services/instagram-graph");

function createInstagramRouter({ db, config, enqueueInstagramCrossPostByPostId }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  router.get(
    "/oauth/url",
    authMiddleware,
    asyncHandler(async (req, res) => {
      if (!isMetaConfigured(config)) {
        throw httpError(503, "Instagram integration is not configured");
      }
      const state = signOAuthState(config, req.user.id);
      const url = buildAuthorizeUrl(config, state);
      res.status(200).json({ url });
    })
  );

  router.get(
    "/oauth/callback",
    asyncHandler(async (req, res) => {
      const base = normalizeAppBase(config);
      const accountUrl = `${base}/account`;
      const { code, state, error, error_description: errorDescription } = req.query;
      if (error) {
        const msg = encodeURIComponent(String(errorDescription || error || "oauth_error"));
        return res.redirect(302, `${accountUrl}?instagram_error=${msg}`);
      }
      if (!code || !state) {
        return res.redirect(302, `${accountUrl}?instagram_error=missing_code`);
      }
      if (!isMetaConfigured(config)) {
        return res.redirect(302, `${accountUrl}?instagram_error=not_configured`);
      }
      try {
        const userId = verifyOAuthState(config, state);
        await persistConnectionFromOAuthCode({ db, config, userId, code });
        return res.redirect(302, `${accountUrl}?instagram_connected=1`);
      } catch (err) {
        const msg = encodeURIComponent(
          String(err.statusCode === 400 ? err.message : err.message || "connect_failed").slice(0, 500)
        );
        return res.redirect(302, `${accountUrl}?instagram_error=${msg}`);
      }
    })
  );

  router.get(
    "/status",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const row = await db.query(
        `SELECT ig_user_id, ig_username, connected_at
         FROM user_instagram_connections
         WHERE user_id = $1
         LIMIT 1`,
        [req.user.id]
      );
      if (row.rowCount === 0) {
        return res.status(200).json({ connected: false });
      }
      const r = row.rows[0];
      res.status(200).json({
        connected: true,
        igUserId: r.ig_user_id,
        igUsername: r.ig_username || null,
        connectedAt: r.connected_at
      });
    })
  );

  router.delete(
    "/connection",
    authMiddleware,
    asyncHandler(async (req, res) => {
      await db.query(`DELETE FROM user_instagram_connections WHERE user_id = $1`, [req.user.id]);
      res.status(200).json({ disconnected: true });
    })
  );

  /** Debug: last cross-post attempts for current user (no secrets). */
  router.post(
    "/cross-post/:postId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const postId = Number(req.params.postId);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }
      if (typeof enqueueInstagramCrossPostByPostId !== "function") {
        throw httpError(503, "Instagram cross-post is not available");
      }
      const result = await enqueueInstagramCrossPostByPostId(req.user.id, postId);
      if (!result.ok) {
        throw httpError(404, "Post not found");
      }
      res.status(202).json({ accepted: true });
    })
  );

  router.get(
    "/cross-posts/recent",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const result = await db.query(
        `SELECT icp.post_id, icp.status, icp.ig_media_id, icp.error_message, icp.created_at, icp.updated_at
         FROM instagram_cross_posts icp
         WHERE icp.user_id = $1
         ORDER BY icp.created_at DESC
         LIMIT $2`,
        [req.user.id, limit]
      );
      res.status(200).json({ items: result.rows });
    })
  );

  return router;
}

module.exports = {
  createInstagramRouter
};
