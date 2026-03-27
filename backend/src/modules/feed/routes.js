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

function createFeedRouter({ db, config, mediaStorage }) {
  const router = express.Router();

  async function getSponsoredCampaign({ db, viewerId, feedTab }) {
    const result = await db.query(
      `SELECT ac.id AS campaign_id,
              ac.creator_user_id,
              ac.post_id,
              ac.budget_minor,
              ac.spent_minor,
              ac.currency,
              p.author_id,
              p.post_type,
              p.content,
              p.media_url,
              p.media_mime_type,
              p.style_tag,
              p.tags,
              p.created_at,
              p.is_business_post,
              p.cta_label,
              p.cta_url,
              p.audience_target,
              p.business_category,
              pr.display_name AS author_display_name,
              pr.avatar_url AS author_avatar_url
       FROM ad_campaigns ac
       JOIN posts p ON p.id = ac.post_id
       JOIN profiles pr ON pr.user_id = p.author_id
       JOIN ad_creative_reviews acr ON acr.campaign_id = ac.id
       WHERE ac.status = 'active'
         AND acr.status = 'approved'
         AND ac.spent_minor < ac.budget_minor
         AND p.visibility_status = 'visible'
         AND p.media_status = 'ready'
         AND p.removed_at IS NULL
         AND (
           ($2::text = 'for_you' AND p.post_type IN ('post', 'recitation', 'marketplace'))
           OR (
             $2::text = 'opportunities'
             AND p.post_type = 'marketplace'
             AND p.audience_target IN ('b2b', 'both')
           )
           OR ($2::text = 'marketplace' AND p.post_type = 'marketplace')
         )
         AND (
           $1::int IS NULL
           OR (
             NOT EXISTS (
               SELECT 1 FROM user_blocks ub
               WHERE (ub.user_id = $1 AND ub.blocked_user_id = p.author_id)
                  OR (ub.user_id = p.author_id AND ub.blocked_user_id = $1)
             )
             AND NOT EXISTS (
               SELECT 1 FROM user_mutes um
               WHERE um.user_id = $1 AND um.muted_user_id = p.author_id
             )
           )
         )
       ORDER BY ac.updated_at DESC, ac.id DESC
       LIMIT 1`,
      [viewerId, feedTab]
    );
    return result.rows[0] || null;
  }

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      const followingOnly = String(req.query.followingOnly || "false") === "true";
      const postType = req.query.postType || null;
      const feedTab = String(req.query.feedTab || "for_you").trim().toLowerCase();
      const authorId = req.query.authorId ? Number(req.query.authorId) : null;
      const minCreatedAt = req.query.minCreatedAt
        ? new Date(String(req.query.minCreatedAt))
        : null;
      const cursor = decodeCursor(req.query.cursor);
      const rankWeights = config.feedRankWeights || {
        comment: 120,
        benefited: 60,
        watchTimeSeconds: 1,
        completionRate: 2,
        followBoost: 300,
        affinity: 45,
        interestBoost: 220
      };
      const viewerId = await getViewerIdFromAuthHeader({
        db,
        config,
        authorization: req.headers.authorization
      });

      if (postType && !["post", "recitation", "marketplace"].includes(postType)) {
        throw httpError(400, "postType must be post, recitation, or marketplace");
      }
      if (!["for_you", "opportunities", "marketplace"].includes(feedTab)) {
        throw httpError(400, "feedTab must be for_you, opportunities, or marketplace");
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
      let behavior = { b2bPurchases: 0, b2cPurchases: 0 };
      if (viewerId) {
        const behaviorResult = await db.query(
          `SELECT
             COALESCE(
               SUM(
                 CASE
                   WHEN cp.product_type IN ('service', 'subscription') THEN 1
                   ELSE 0
                 END
               ),
               0
             )::int AS b2b_purchases,
             COALESCE(
               SUM(
                 CASE
                   WHEN cp.product_type = 'digital' THEN 1
                   ELSE 0
                 END
               ),
               0
             )::int AS b2c_purchases
           FROM orders o
           LEFT JOIN creator_products cp ON cp.id = o.product_id
           WHERE o.buyer_user_id = $1
             AND o.status = 'completed'`,
          [viewerId]
        );
        behavior = {
          b2bPurchases: Number(behaviorResult.rows[0]?.b2b_purchases || 0),
          b2cPurchases: Number(behaviorResult.rows[0]?.b2c_purchases || 0)
        };
      }

      const [result, profileIntentsResult] = await Promise.all([
        db.query(
        `WITH viewer_behavior AS (
           SELECT
             COALESCE(
               SUM(
                 CASE
                   WHEN cp.product_type IN ('service', 'subscription') THEN 1
                   ELSE 0
                 END
               ),
               0
             )::int AS b2b_purchases,
             COALESCE(
               SUM(
                 CASE
                   WHEN cp.product_type = 'digital' THEN 1
                   ELSE 0
                 END
               ),
               0
             )::int AS b2c_purchases
           FROM orders o
           LEFT JOIN creator_products cp ON cp.id = o.product_id
           WHERE o.buyer_user_id = $1
             AND o.status = 'completed'
         ),
         viewer_intents AS (
           SELECT
             CASE
               WHEN $1::int IS NULL THEN ARRAY[]::text[]
               ELSE COALESCE(
                 (SELECT onboarding_intents FROM profiles WHERE user_id = $1 LIMIT 1),
                 '{}'::text[]
               )
             END AS intents
         ),
         post_agg AS (
           SELECT p.id,
                p.author_id,
                p.post_type,
                p.content,
                p.media_url,
                p.media_mime_type,
                p.style_tag,
                p.tags,
                p.created_at,
                p.is_business_post,
                p.cta_label,
                p.cta_url,
                p.audience_target,
                p.business_category,
                pr.avatar_url AS author_avatar_url,
                cpr.id AS attached_product_id,
                cpr.title AS attached_product_title,
                cpr.price_minor AS attached_product_price_minor,
                cpr.currency AS attached_product_currency,
                cpr.product_type AS attached_product_type,
                cpr.website_url AS attached_product_website_url,
                COALESCE(cpr.platform_fee_bps, 0)::int AS attached_platform_fee_bps,
                COALESCE(MAX(vs.view_count), 0)::int AS view_count,
                COALESCE(MAX(vs.avg_watch_time_ms), 0)::int AS avg_watch_time_ms,
                COALESCE(MAX(vs.avg_completion_rate), 0)::numeric AS avg_completion_rate,
                pr.display_name AS author_display_name,
                COALESCE(SUM(CASE WHEN i.interaction_type = 'benefited' AND i.deleted_at IS NULL THEN 1 ELSE 0 END), 0)::int AS benefited_count,
                COALESCE(SUM(CASE WHEN i.interaction_type = 'comment' AND i.deleted_at IS NULL THEN 1 ELSE 0 END), 0)::int AS comment_count,
                COALESCE(SUM(CASE WHEN i.interaction_type = 'reflect_later' AND i.deleted_at IS NULL THEN 1 ELSE 0 END), 0)::int AS reflect_later_count,
                CASE
                  WHEN $1::int IS NULL THEN false
                  ELSE EXISTS (
                    SELECT 1 FROM follows f
                    WHERE f.follower_id = $1
                      AND f.following_id = p.author_id
                  )
                END AS is_following_author,
                CASE
                  WHEN $1::int IS NULL THEN false
                  ELSE EXISTS (
                    SELECT 1 FROM interactions li
                    WHERE li.user_id = $1
                      AND li.post_id = p.id
                      AND li.interaction_type = 'benefited'
                      AND li.deleted_at IS NULL
                  )
                END AS liked_by_viewer,
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
                END AS interest_boost,
                CASE
                  WHEN $18::text = 'opportunities' AND p.audience_target = 'b2b' THEN 320
                  WHEN $18::text = 'opportunities' AND p.audience_target = 'both' THEN 140
                  WHEN $18::text = 'opportunities' AND p.audience_target = 'b2c' THEN -80
                  WHEN $18::text = 'marketplace' AND p.audience_target = 'b2c' THEN 320
                  WHEN $18::text = 'marketplace' AND p.audience_target = 'both' THEN 140
                  WHEN $18::text = 'marketplace' AND p.audience_target = 'b2b' THEN -80
                  WHEN $18::text = 'for_you' AND vb.b2b_purchases > vb.b2c_purchases AND p.audience_target = 'b2b' THEN 180
                  WHEN $18::text = 'for_you' AND vb.b2c_purchases > vb.b2b_purchases AND p.audience_target = 'b2c' THEN 180
                  WHEN $18::text = 'for_you' AND p.audience_target = 'both' THEN 90
                  ELSE 0
                END AS audience_tab_boost
                ,
                (
                  (
                    CASE
                      WHEN 'community' = ANY((SELECT intents FROM viewer_intents LIMIT 1))
                        AND p.post_type IN ('post', 'recitation')
                      THEN 1
                      ELSE 0
                    END
                  )
                  + (
                    CASE
                      WHEN 'shop' = ANY((SELECT intents FROM viewer_intents LIMIT 1))
                        AND (p.post_type = 'marketplace' OR cpr.id IS NOT NULL)
                      THEN 1
                      ELSE 0
                    END
                  )
                  + (
                    CASE
                      WHEN 'sell' = ANY((SELECT intents FROM viewer_intents LIMIT 1))
                        AND p.post_type = 'marketplace'
                      THEN 1
                      ELSE 0
                    END
                  )
                  + (
                    CASE
                      WHEN 'b2b' = ANY((SELECT intents FROM viewer_intents LIMIT 1))
                        AND p.audience_target IN ('b2b', 'both')
                      THEN 1
                      ELSE 0
                    END
                  )
                )::numeric AS intent_persona_score
                ,
                COALESCE((
                  SELECT COUNT(*)::int
                  FROM reports r
                  WHERE r.target_type = 'post'
                    AND r.target_id = p.id::text
                    AND r.status IN ('open', 'reviewing')
                ), 0) AS trust_report_count
         FROM posts p
         CROSS JOIN viewer_behavior vb
         JOIN profiles pr ON pr.user_id = p.author_id
         LEFT JOIN post_product_links ppl ON ppl.post_id = p.id
         LEFT JOIN creator_products cpr
           ON cpr.id = ppl.product_id
          AND cpr.status = 'published'
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
           AND p.removed_at IS NULL
           AND (
             $3::int IS NOT NULL
             OR (
               ($18::text = 'for_you' AND p.post_type IN ('post', 'recitation', 'marketplace'))
               OR (
                 $18::text = 'opportunities'
                 AND p.post_type = 'marketplace'
                 AND p.audience_target IN ('b2b', 'both')
               )
               OR ($18::text = 'marketplace' AND p.post_type = 'marketplace')
             )
           )
           AND (
             $1::int IS NULL
             OR (
               NOT EXISTS (
                 SELECT 1 FROM user_blocks ub
                 WHERE (ub.user_id = $1 AND ub.blocked_user_id = p.author_id)
                    OR (ub.user_id = p.author_id AND ub.blocked_user_id = $1)
               )
               AND NOT EXISTS (
                 SELECT 1 FROM user_mutes um
                 WHERE um.user_id = $1 AND um.muted_user_id = p.author_id
               )
             )
           )
         GROUP BY
           p.id,
           pr.display_name,
           pr.avatar_url,
           cpr.id,
           cpr.title,
           cpr.price_minor,
           cpr.currency,
           cpr.product_type,
           cpr.website_url,
           cpr.platform_fee_bps,
           vb.b2b_purchases,
           vb.b2c_purchases
         ),
         ranked AS (
           SELECT *,
                  (
                    EXTRACT(EPOCH FROM created_at)
                    + (comment_count * $6::numeric)
                    + (benefited_count * $7::numeric)
                    + ((avg_watch_time_ms / 1000.0) * $8::numeric)
                    + (avg_completion_rate * $9::numeric)
                    + (follow_boost * $10::numeric)
                    + (affinity_score * $11::numeric)
                    + (interest_boost * $12::numeric)
                    + (audience_tab_boost * $19::numeric)
                    + (intent_persona_score * $22::numeric)
                    - (trust_report_count * $17::numeric)
                    + (
                      CASE
                        WHEN attached_product_id IS NULL THEN 0::numeric
                        ELSE (LEAST(attached_platform_fee_bps, $20::int)::numeric / 10000.0) * $21::numeric
                      END
                    )
                  )::numeric AS rank_score
           FROM post_agg
         )
         SELECT *
         FROM ranked
         WHERE (
          $13::numeric IS NULL
          OR rank_score < $13::numeric
          OR (rank_score = $13::numeric AND created_at < $14::timestamptz)
          OR (rank_score = $13::numeric AND created_at = $14::timestamptz AND id < $15::int)
         )
         ORDER BY rank_score DESC, created_at DESC, id DESC
         LIMIT $16`,
        [
          viewerId,
          postType,
          authorId,
          minCreatedAt ? minCreatedAt.toISOString() : null,
          followingOnly,
          rankWeights.comment,
          rankWeights.benefited,
          rankWeights.watchTimeSeconds,
          rankWeights.completionRate,
          rankWeights.followBoost,
          rankWeights.affinity,
          rankWeights.interestBoost,
          cursor ? cursor.rankScore : null,
          cursor ? cursor.createdAt : null,
          cursor ? cursor.id : null,
          limit + 1,
          Number(config.feedTrustReportPenaltyWeight || 250),
          feedTab,
          Number(config.feedAudienceTabBoostWeight || 1),
          Number(config.feedRankPlatformFeeCapBps ?? 3500),
          Number(config.feedRankPlatformFeeWeight ?? 3),
          Number(config.feedRankOnboardingIntentWeight ?? 60)
        ]
        ),
        viewerId
          ? db.query(
              `SELECT COALESCE(onboarding_intents, '{}'::text[]) AS onboarding_intents
               FROM profiles WHERE user_id = $1 LIMIT 1`,
              [viewerId]
            )
          : Promise.resolve({ rows: [{ onboarding_intents: [] }] })
      ]);

      const onboardingIntentsApplied = Array.isArray(profileIntentsResult.rows[0]?.onboarding_intents)
        ? profileIntentsResult.rows[0].onboarding_intents
        : [];

      const hasMore = result.rows.length > limit;
      const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
      let items = rows.map((row) => {
        const cleaned = { ...row };
        delete cleaned.intent_persona_score;
        return {
          ...cleaned,
          media_url: mediaStorage?.resolveMediaUrl
            ? mediaStorage.resolveMediaUrl({
                mediaKey: row.media_upload_key || row.media_url,
                mediaUrl: row.media_url
              })
            : row.media_url,
          author_avatar_url: mediaStorage?.resolveMediaUrl
            ? mediaStorage.resolveMediaUrl({
                mediaKey: row.author_avatar_url,
                mediaUrl: row.author_avatar_url
              })
            : row.author_avatar_url
        };
      });
      const adInsertEvery = Math.max(Number(config.feedSponsoredInsertEvery || 6), 3);
      const canInsertSponsored = !followingOnly && items.length >= adInsertEvery - 1;
      if (canInsertSponsored) {
        const sponsored = await getSponsoredCampaign({ db, viewerId, feedTab });
        if (sponsored && !items.some((item) => Number(item.id) === Number(sponsored.post_id))) {
          const sponsoredItem = {
            id: sponsored.post_id,
            author_id: sponsored.author_id,
            post_type: sponsored.post_type,
            content: sponsored.content,
            media_url: mediaStorage?.resolveMediaUrl
              ? mediaStorage.resolveMediaUrl({
                  mediaKey: sponsored.media_url,
                  mediaUrl: sponsored.media_url
                })
              : sponsored.media_url,
            media_mime_type: sponsored.media_mime_type,
            style_tag: sponsored.style_tag,
            tags: sponsored.tags || [],
            created_at: sponsored.created_at,
            author_display_name: sponsored.author_display_name,
            author_avatar_url: mediaStorage?.resolveMediaUrl
              ? mediaStorage.resolveMediaUrl({
                  mediaKey: sponsored.author_avatar_url,
                  mediaUrl: sponsored.author_avatar_url
                })
              : sponsored.author_avatar_url,
            benefited_count: 0,
            comment_count: 0,
            reflect_later_count: 0,
            is_following_author: false,
            liked_by_viewer: false,
            is_business_post: sponsored.is_business_post,
            cta_label: sponsored.cta_label,
            cta_url: sponsored.cta_url,
            audience_target: sponsored.audience_target,
            business_category: sponsored.business_category,
            sponsored: true,
            sponsored_label: "Sponsored",
            ad_campaign_id: sponsored.campaign_id
          };
          const insertIndex = Math.min(adInsertEvery - 1, items.length);
          items = [...items.slice(0, insertIndex), sponsoredItem, ...items.slice(insertIndex)];
        }
      }
      const nextCursor = hasMore ? encodeCursor(rows[rows.length - 1]) : null;

      res.status(200).json({
        items,
        hasMore,
        nextCursor,
        limit,
        persona: {
          inferred:
            behavior.b2bPurchases > behavior.b2cPurchases
              ? "b2b"
              : behavior.b2cPurchases > behavior.b2bPurchases
                ? "b2c"
                : "balanced",
          b2bPurchases: behavior.b2bPurchases,
          b2cPurchases: behavior.b2cPurchases,
          onboardingIntents: onboardingIntentsApplied
        },
        filters: {
          postType: postType || null,
          feedTab,
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
