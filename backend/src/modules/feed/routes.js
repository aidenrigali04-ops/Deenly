const express = require("express");
const jwt = require("jsonwebtoken");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { requireAccessSecret } = require("../../middleware/auth");

function decodeCursor(cursor) {
  if (!cursor) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !decoded ||
      typeof decoded.rankScore !== "number" ||
      !Number.isFinite(decoded.rankScore) ||
      !decoded.createdAt ||
      !Number.isInteger(decoded.id)
    ) {
      throw new Error("Invalid cursor shape");
    }
    return decoded;
  } catch {
    throw httpError(400, "Invalid cursor");
  }
}

function encodeCursor(row) {
  const payload = {
    rankScore: Number(row.rank_score),
    createdAt: row.created_at,
    id: row.id
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

async function getViewerIdFromAuthHeader({ db, config, authorization }) {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length);
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, requireAccessSecret(config));
    const userId = Number(payload.sub);
    if (!userId) {
      return null;
    }

    const result = await db.query(
      "SELECT id FROM users WHERE id = $1 AND is_active = true LIMIT 1",
      [userId]
    );
    if (result.rowCount === 0) {
      return null;
    }
    return result.rows[0].id;
  } catch {
    return null;
  }
}

function createFeedRouter({ db, config }) {
  const router = express.Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      const followingOnly = String(req.query.followingOnly || "false") === "true";
      const postType = req.query.postType || null;
      const authorId = req.query.authorId ? Number(req.query.authorId) : null;
      const minCreatedAt = req.query.minCreatedAt
        ? new Date(String(req.query.minCreatedAt))
        : null;
      const cursor = decodeCursor(req.query.cursor);
      const viewerId = await getViewerIdFromAuthHeader({
        db,
        config,
        authorization: req.headers.authorization
      });

      if (postType && !["recitation", "community", "short_video"].includes(postType)) {
        throw httpError(400, "postType must be recitation, community, or short_video");
      }
      if (req.query.authorId && !authorId) {
        throw httpError(400, "authorId must be a number");
      }
      if (req.query.minCreatedAt && Number.isNaN(minCreatedAt?.getTime())) {
        throw httpError(400, "minCreatedAt must be a valid ISO timestamp");
      }
      if (followingOnly && !viewerId) {
        throw httpError(401, "followingOnly feed requires authentication");
      }

      const result = await db.query(
        `WITH post_agg AS (
           SELECT p.id,
                p.author_id,
                p.post_type,
                p.content,
                p.media_url,
                p.style_tag,
                p.created_at,
                COALESCE(MAX(vs.view_count), 0)::int AS view_count,
                COALESCE(MAX(vs.avg_watch_time_ms), 0)::int AS avg_watch_time_ms,
                COALESCE(MAX(vs.avg_completion_rate), 0)::numeric AS avg_completion_rate,
                pr.display_name AS author_display_name,
                COALESCE(SUM(CASE WHEN i.interaction_type = 'benefited' THEN 1 ELSE 0 END), 0)::int AS benefited_count,
                COALESCE(SUM(CASE WHEN i.interaction_type = 'comment' THEN 1 ELSE 0 END), 0)::int AS comment_count,
                COALESCE(SUM(CASE WHEN i.interaction_type = 'reflect_later' THEN 1 ELSE 0 END), 0)::int AS reflect_later_count,
                CASE
                  WHEN $1::int IS NULL THEN 0
                  WHEN EXISTS (
                    SELECT 1 FROM follows f
                    WHERE f.follower_id = $1
                      AND f.following_id = p.author_id
                  ) THEN 2.5
                  ELSE 0
                END AS follow_boost,
                CASE
                  WHEN $1::int IS NULL THEN 0
                  ELSE COALESCE((
                    SELECT COUNT(*)::int
                    FROM interactions pi
                    JOIN posts ap ON ap.id = pi.post_id
                    WHERE pi.user_id = $1
                      AND ap.author_id = p.author_id
                      AND pi.interaction_type IN ('benefited', 'comment')
                  ), 0)
                END AS affinity_score,
                CASE
                  WHEN $1::int IS NULL THEN 0
                  WHEN EXISTS (
                    SELECT 1
                    FROM user_interests ui
                    WHERE ui.user_id = $1
                      AND ui.interest_key = p.post_type
                  ) THEN 1.8
                  ELSE 0
                END AS interest_boost
         FROM posts p
         JOIN profiles pr ON pr.user_id = p.author_id
         LEFT JOIN interactions i ON i.post_id = p.id
         LEFT JOIN (
           SELECT post_id,
                  COUNT(*)::int AS view_count,
                  AVG(watch_time_ms)::int AS avg_watch_time_ms,
                  ROUND(AVG(completion_rate), 2) AS avg_completion_rate
           FROM post_views
           GROUP BY post_id
         ) vs ON vs.post_id = p.id
         WHERE ($2::text IS NULL OR p.post_type = $2::text)
           AND ($3::int IS NULL OR p.author_id = $3::int)
           AND ($4::timestamptz IS NULL OR p.created_at >= $4::timestamptz)
           AND ($5::boolean = false OR EXISTS (
             SELECT 1 FROM follows ff
             WHERE ff.follower_id = $1
               AND ff.following_id = p.author_id
           ))
           AND p.visibility_status = 'visible'
           AND p.media_status = 'ready'
         GROUP BY p.id, pr.display_name
         ),
         ranked AS (
           SELECT *,
                  (
                    EXTRACT(EPOCH FROM created_at)
                    + (comment_count * 120)
                    + (benefited_count * 60)
                    + (avg_watch_time_ms / 1000.0)
                    + (avg_completion_rate * 2)
                    + (follow_boost * 300)
                    + (affinity_score * 45)
                    + (interest_boost * 220)
                  )::numeric AS rank_score
           FROM post_agg
         )
         SELECT *
         FROM ranked
         WHERE (
           $6::numeric IS NULL
           OR rank_score < $6::numeric
           OR (rank_score = $6::numeric AND id < $7::int)
         )
         ORDER BY rank_score DESC, created_at DESC, id DESC
         LIMIT $8`,
        [
          viewerId,
          postType,
          authorId,
          minCreatedAt ? minCreatedAt.toISOString() : null,
          followingOnly,
          cursor ? cursor.rankScore : null,
          cursor ? cursor.id : null,
          limit + 1
        ]
      );

      const hasMore = result.rows.length > limit;
      const items = hasMore ? result.rows.slice(0, limit) : result.rows;
      const nextCursor = hasMore ? encodeCursor(items[items.length - 1]) : null;

      res.status(200).json({
        items,
        hasMore,
        nextCursor,
        limit,
        filters: {
          postType: postType || null,
          followingOnly,
          authorId: authorId || null,
          minCreatedAt: minCreatedAt ? minCreatedAt.toISOString() : null
        }
      });
    })
  );

  return router;
}

module.exports = {
  createFeedRouter
};
