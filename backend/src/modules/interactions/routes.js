const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { optionalString, requireString } = require("../../utils/validators");
const { httpError } = require("../../utils/http-error");

const INTERACTION_TYPES = new Set(["benefited", "reflect_later", "comment"]);

function createInteractionsRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({
    config: config || { jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "" },
    db
  });

  router.post(
    "/",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const postId = Number(req.body?.postId);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }

      const interactionType = requireString(
        req.body?.interactionType,
        "interactionType",
        3,
        32
      );
      if (!INTERACTION_TYPES.has(interactionType)) {
        throw httpError(400, "Unsupported interactionType");
      }

      const commentText =
        interactionType === "comment"
          ? requireString(req.body?.commentText, "commentText", 1, 2000)
          : optionalString(req.body?.commentText, "commentText", 2000);

      const existing = await db.query(
        `SELECT id
         FROM interactions
         WHERE user_id = $1
           AND post_id = $2
           AND interaction_type = $3
           AND interaction_type != 'comment'
         LIMIT 1`,
        [req.user.id, postId, interactionType]
      );

      if (existing.rowCount > 0) {
        return res.status(200).json({
          id: existing.rows[0].id,
          duplicate: true
        });
      }

      const result = await db.query(
        `INSERT INTO interactions (user_id, post_id, interaction_type, comment_text)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, post_id, interaction_type, comment_text, created_at`,
        [req.user.id, postId, interactionType, commentText]
      );

      return res.status(201).json(result.rows[0]);
    })
  );

  router.get(
    "/post/:postId",
    asyncHandler(async (req, res) => {
      const postId = Number(req.params.postId);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }

      const result = await db.query(
        `SELECT interaction_type, COUNT(*)::int AS total
         FROM interactions
         WHERE post_id = $1
         GROUP BY interaction_type`,
        [postId]
      );

      res.status(200).json({
        postId,
        totals: result.rows
      });
    })
  );

  return router;
}

module.exports = {
  createInteractionsRouter
};
