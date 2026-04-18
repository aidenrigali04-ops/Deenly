const express = require("express");
const jwt = require("jsonwebtoken");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { requireAccessSecret } = require("../../middleware/auth");
const { getFeedRankModifierBindings, getFeedEngagementProxyBindings } = require("./feed-rank-modifiers");
const { buildSellerBoostTierPointsCaseSql } = require("../../config/seller-boost-catalog");

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

function createFeedRouter({ db, config, mediaStorage, analytics: feedAnalytics = null }) {
  const router = express.Router();
  const sellerBoostTierCaseSql = buildSellerBoostTierPointsCaseSql(config);

  async function getRankedEventCandidates({
    db,
    viewerId,
    feedTab,
    limit,
    onboardingIntentsForFeed,
    nowIso
  }) {
    if (!config.eventsFeatureEnabled || !config.eventsReadEnabled) {
      return [];
    }
    if (feedTab !== "for_you") {
      return [];
    }
    const cappedLimit = Math.min(Math.max(Number(limit) || 4, 1), Number(config.feedEventCandidatesLimit || 6));
    const result = await db.query(
      `SELECT e.id,
              e.host_user_id,
              e.title,
              e.description,
              e.starts_at,
              e.ends_at,
              e.timezone,
              e.is_online,
              e.online_url,
              e.address_display,
              e.latitude,
              e.longitude,
              e.visibility,
              e.capacity,
              e.status,
              e.created_at,
              e.updated_at,
              p.display_name AS host_display_name,
              (
                SELECT r.status
                FROM event_rsvps r
                WHERE r.event_id = e.id
                  AND r.user_id = $1
                LIMIT 1
              ) AS viewer_rsvp_status,
              (
                SELECT COUNT(*)::int
                FROM event_rsvps r
                WHERE r.event_id = e.id
                  AND r.status = 'interested'
              ) AS rsvp_interested_count,
              (
                SELECT COUNT(*)::int
                FROM event_rsvps r
                WHERE r.event_id = e.id
                  AND r.status = 'going'
              ) AS rsvp_going_count,
              (
                EXTRACT(EPOCH FROM e.starts_at) +
                CASE WHEN e.host_user_id = $1 THEN 250 ELSE 0 END +
                CASE WHEN EXISTS (
                  SELECT 1 FROM follows f
                  WHERE f.follower_id = $1 AND f.following_id = e.host_user_id
                ) THEN 180 ELSE 0 END +
                CASE WHEN EXISTS (
                  SELECT 1
                  FROM event_rsvps mine
                  WHERE mine.event_id = e.id
                    AND mine.user_id = $1
                    AND mine.status = 'going'
                ) THEN 220 ELSE 0 END +
                CASE
                  WHEN 'community' = ANY($3::text[]) THEN 80
                  ELSE 0
                END +
                LEAST(
                  GREATEST(0, COALESCE((
                    SELECT COUNT(*)::int
                    FROM event_rsvps rr
                    WHERE rr.event_id = e.id
                      AND rr.status = 'going'
                  ), 0)),
                  150
                )
              )::numeric AS event_rank_score
       FROM events e
       JOIN profiles p ON p.user_id = e.host_user_id
       WHERE e.status = 'scheduled'
         AND e.visibility = 'public'
         AND e.starts_at >= $2::timestamptz
         AND e.starts_at < $2::timestamptz + interval '30 day'
         AND (
           $1::int IS NULL
           OR (
             NOT EXISTS (
               SELECT 1 FROM user_blocks ub
               WHERE (ub.user_id = $1 AND ub.blocked_user_id = e.host_user_id)
                  OR (ub.user_id = e.host_user_id AND ub.blocked_user_id = $1)
             )
             AND NOT EXISTS (
               SELECT 1 FROM user_mutes um
               WHERE um.user_id = $1 AND um.muted_user_id = e.host_user_id
             )
           )
         )
       ORDER BY event_rank_score DESC, e.starts_at ASC, e.id ASC
       LIMIT $4`,
      [viewerId, nowIso, onboardingIntentsForFeed, cappedLimit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      host_user_id: row.host_user_id,
      host_display_name: row.host_display_name,
      title: row.title,
      description: row.description,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      timezone: row.timezone,
      is_online: row.is_online,
      online_url: row.online_url,
      address_display: row.address_display,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      visibility: row.visibility,
      capacity: row.capacity,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      viewer_rsvp_status: row.viewer_rsvp_status || null,
      rsvp_interested_count: Number(row.rsvp_interested_count || 0),
      rsvp_going_count: Number(row.rsvp_going_count || 0),
      can_join_chat: row.viewer_rsvp_status === "going" || row.host_user_id === viewerId,
      event_rank_score: Number(row.event_rank_score || 0)
    }));
  }

  function mapSponsoredEventRow(row, viewerId) {
    return {
      id: row.event_row_id,
      host_user_id: row.host_user_id,
      host_display_name: row.host_display_name,
      title: row.title,
      description: row.description,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      timezone: row.timezone,
      is_online: row.is_online,
      online_url: row.online_url,
      address_display: row.address_display,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      visibility: row.visibility,
      capacity: row.capacity,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      viewer_rsvp_status: row.viewer_rsvp_status || null,
      rsvp_interested_count: Number(row.rsvp_interested_count || 0),
      rsvp_going_count: Number(row.rsvp_going_count || 0),
      can_join_chat: row.viewer_rsvp_status === "going" || row.host_user_id === viewerId,
      event_rank_score: 0
    };
  }

  async function getSponsoredCampaign({ db, viewerId, feedTab }) {
    const postResult = await db.query(
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
           ($2::text = 'for_you' AND p.post_type IN ('post', 'marketplace'))
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
    if (postResult.rows[0]) {
      return { kind: "post", row: postResult.rows[0] };
    }

    if (feedTab !== "for_you") {
      return null;
    }

    const eventResult = await db.query(
      `SELECT ac.id AS campaign_id,
              e.id AS event_row_id,
              e.host_user_id,
              e.title,
              e.description,
              e.starts_at,
              e.ends_at,
              e.timezone,
              e.is_online,
              e.online_url,
              e.address_display,
              e.latitude,
              e.longitude,
              e.visibility,
              e.capacity,
              e.status,
              e.created_at,
              e.updated_at,
              pr.display_name AS host_display_name,
              (
                SELECT r.status
                FROM event_rsvps r
                WHERE r.event_id = e.id
                  AND r.user_id = $1
                LIMIT 1
              ) AS viewer_rsvp_status,
              (
                SELECT COUNT(*)::int
                FROM event_rsvps r
                WHERE r.event_id = e.id
                  AND r.status = 'interested'
              ) AS rsvp_interested_count,
              (
                SELECT COUNT(*)::int
                FROM event_rsvps r
                WHERE r.event_id = e.id
                  AND r.status = 'going'
              ) AS rsvp_going_count
       FROM ad_campaigns ac
       JOIN events e ON e.id = ac.event_id
       JOIN profiles pr ON pr.user_id = e.host_user_id
       JOIN ad_creative_reviews acr ON acr.campaign_id = ac.id
       WHERE ac.status = 'active'
         AND acr.status = 'approved'
         AND ac.spent_minor < ac.budget_minor
         AND e.status = 'scheduled'
         AND e.visibility = 'public'
         AND e.starts_at >= NOW()
         AND (
           $1::int IS NULL
           OR (
             NOT EXISTS (
               SELECT 1 FROM user_blocks ub
               WHERE (ub.user_id = $1 AND ub.blocked_user_id = e.host_user_id)
                  OR (ub.user_id = e.host_user_id AND ub.blocked_user_id = $1)
             )
             AND NOT EXISTS (
               SELECT 1 FROM user_mutes um
               WHERE um.user_id = $1 AND um.muted_user_id = e.host_user_id
             )
           )
         )
       ORDER BY ac.updated_at DESC, ac.id DESC
       LIMIT 1`,
      [viewerId]
    );
    if (!eventResult.rows[0]) {
      return null;
    }
    const r = eventResult.rows[0];
    return {
      kind: "event",
      campaign_id: r.campaign_id,
      event: mapSponsoredEventRow(r, viewerId)
    };
  }

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      const followingOnly = String(req.query.followingOnly || "false") === "true";
      const postType = req.query.postType || null;
      let feedTab = String(req.query.feedTab || "for_you").trim().toLowerCase();
      if (feedTab === "opportunities") {
        feedTab = "for_you";
      }
      const authorId = req.query.authorId ? Number(req.query.authorId) : null;
      const minCreatedAt = req.query.minCreatedAt
        ? new Date(String(req.query.minCreatedAt))
        : null;
      const cursor = decodeCursor(req.query.cursor);
      const includeEvents = String(req.query.includeEvents || "false") === "true";
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

      if (postType && !["post", "marketplace", "reel"].includes(postType)) {
        throw httpError(400, "postType must be post, marketplace, or reel");
      }
      if (!["for_you", "marketplace", "reels"].includes(feedTab)) {
        throw httpError(400, "feedTab must be for_you, marketplace, or reels");
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

      let onboardingIntentsForFeed = [];
      if (viewerId) {
        try {
          const intentsResult = await db.query(
            `SELECT COALESCE(onboarding_intents, '{}'::text[]) AS onboarding_intents
             FROM profiles WHERE user_id = $1 LIMIT 1`,
            [viewerId]
          );
          if (Array.isArray(intentsResult.rows[0]?.onboarding_intents)) {
            onboardingIntentsForFeed = intentsResult.rows[0].onboarding_intents;
          }
        } catch {
          /* e.g. column missing before migration — skip intent boosts, still return feed */
        }
      }

      const rankModifiers = getFeedRankModifierBindings(config);
      const engagementProxy = getFeedEngagementProxyBindings(config);
      const result = await db.query(
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
                cpr.boost_tier AS attached_boost_tier,
                CASE
                  WHEN cpr.id IS NULL THEN 0
                  ELSE COALESCE(
                    (
                      SELECT COUNT(*)::int
                      FROM orders o_sales
                      WHERE o_sales.product_id = cpr.id
                        AND o_sales.status = 'completed'
                    ),
                    0
                  )
                END AS product_completed_orders,
                COALESCE(
                  (
                    SELECT COUNT(*)::int
                    FROM reports r_author
                    WHERE r_author.target_type = 'user'
                      AND r_author.target_id = p.author_id::text
                      AND r_author.status IN ('open', 'reviewing')
                  ),
                  0
                ) AS author_open_reports,
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
                      WHEN 'community' = ANY($23::text[])
                        AND p.post_type IN ('post', 'reel')
                      THEN 1
                      ELSE 0
                    END
                  )
                  + (
                    CASE
                      WHEN 'shop' = ANY($23::text[])
                        AND (p.post_type = 'marketplace' OR cpr.id IS NOT NULL)
                      THEN 1
                      ELSE 0
                    END
                  )
                  + (
                    CASE
                      WHEN 'sell' = ANY($23::text[])
                        AND p.post_type = 'marketplace'
                      THEN 1
                      ELSE 0
                    END
                  )
                  + (
                    CASE
                      WHEN 'b2b' = ANY($23::text[])
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
                ,
                MAX(
                  CASE
                    WHEN $37::boolean THEN
                      COALESCE(
                        (
                          SELECT LEAST(
                            COALESCE(SUM(${sellerBoostTierCaseSql}), 0::numeric),
                            $36::numeric
                          )
                          FROM seller_boost_targets t
                          INNER JOIN seller_boost_purchases sbp ON sbp.id = t.purchase_id
                          WHERE t.post_id = p.id
                            AND sbp.status = 'active'
                            AND sbp.starts_at IS NOT NULL
                            AND sbp.ends_at IS NOT NULL
                            AND sbp.starts_at <= NOW()
                            AND sbp.ends_at > NOW()
                        ),
                        0::numeric
                      )
                    ELSE 0::numeric
                  END
                ) AS seller_boost_rank_bonus
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
               ($18::text = 'for_you' AND p.post_type IN ('post', 'marketplace'))
               OR ($18::text = 'marketplace' AND p.post_type = 'marketplace')
               OR (
                 $18::text = 'reels'
                 AND p.post_type = 'reel'
                 AND p.media_mime_type LIKE 'video/%'
               )
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
           cpr.boost_tier,
           vb.b2b_purchases,
           vb.b2c_purchases
         ),
         ranked AS (
           SELECT pa.*,
                  (
                    EXTRACT(EPOCH FROM pa.created_at)
                    + (pa.comment_count * $6::numeric)
                    + (pa.benefited_count * $7::numeric)
                    + ((pa.avg_watch_time_ms / 1000.0) * $8::numeric)
                    + (pa.avg_completion_rate * $9::numeric)
                    + (pa.follow_boost * $10::numeric)
                    + (pa.affinity_score * $11::numeric)
                    + (pa.interest_boost * $12::numeric)
                    + (pa.audience_tab_boost * $19::numeric)
                    + (pa.intent_persona_score * $22::numeric)
                    - (pa.trust_report_count * $17::numeric)
                    + (
                      CASE
                        WHEN pa.attached_product_id IS NULL THEN 0::numeric
                        ELSE (LEAST(pa.attached_platform_fee_bps, $20::int)::numeric / 10000.0) * $21::numeric
                      END
                    )
                    + (
                      CASE
                        WHEN $24::boolean THEN
                          LEAST(
                            $31::numeric,
                            LEAST($25::numeric, pa.rewards_engagement_proxy * $26::numeric)
                            + LEAST($27::numeric, pa.boost_tier_unit * $28::numeric)
                            + (
                              CASE
                                WHEN $18::text = 'marketplace'
                                  AND pa.attached_product_id IS NOT NULL THEN
                                  LEAST(
                                    $29::numeric,
                                    LN(1 + GREATEST(pa.product_completed_orders, 0)::numeric) * $30::numeric
                                  )
                                  + LEAST($32::numeric, pa.conversion_proxy * $33::numeric)
                                ELSE 0::numeric
                              END
                            )
                          )
                        ELSE 0::numeric
                      END
                    )
                    - (
                      CASE
                        WHEN $24::boolean THEN
                          LEAST($34::numeric, pa.author_open_reports::numeric * $35::numeric)
                        ELSE 0::numeric
                      END
                    )
                    + (pa.seller_boost_rank_bonus * $38::numeric)
                  )::numeric AS rank_score
           FROM (
             SELECT post_agg.*,
                    CASE LOWER(COALESCE(post_agg.attached_boost_tier, ''))
                      WHEN 'boosted' THEN 1::numeric
                      WHEN 'aggressive' THEN 2::numeric
                      ELSE 0::numeric
                    END AS boost_tier_unit,
                    CASE
                      WHEN post_agg.trust_report_count > 0 THEN 0::numeric
                      ELSE LEAST(
                        1::numeric,
                        LEAST(COALESCE(post_agg.avg_completion_rate, 0), 1) * $39::numeric
                        + LEAST(
                          COALESCE(post_agg.view_count, 0)::numeric / NULLIF($40::numeric, 0),
                          1::numeric
                        ) * $41::numeric
                        + LEAST(
                          (
                            COALESCE(post_agg.comment_count, 0) + COALESCE(post_agg.benefited_count, 0)
                          )::numeric / NULLIF($42::numeric, 0),
                          1::numeric
                        ) * $43::numeric
                      )
                    END AS rewards_engagement_proxy,
                    CASE
                      WHEN post_agg.attached_product_id IS NULL OR COALESCE(post_agg.view_count, 0) <= 0 THEN
                        0::numeric
                      ELSE LEAST(
                        1::numeric,
                        post_agg.product_completed_orders::numeric
                        / NULLIF(post_agg.view_count::numeric, 0)
                      )
                    END AS conversion_proxy
             FROM post_agg
           ) pa
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
          Number(config.feedRankOnboardingIntentWeight ?? 60),
          onboardingIntentsForFeed,
          rankModifiers.enabled,
          rankModifiers.capEngagement,
          rankModifiers.weightEngagement,
          rankModifiers.capBoost,
          rankModifiers.weightBoost,
          rankModifiers.capSales,
          rankModifiers.weightSales,
          rankModifiers.combinedPositive,
          rankModifiers.capConversion,
          rankModifiers.weightConversion,
          rankModifiers.capSellerTrustSub,
          rankModifiers.weightSellerTrustPerReport,
          Number(config.feedSellerBoostRankCap ?? 60),
          Boolean(config.feedSellerBoostRankingEnabled),
          Number(config.feedSellerBoostRankWeight ?? 1),
          engagementProxy.weightCompletion,
          engagementProxy.viewCapDivisor,
          engagementProxy.weightViews,
          engagementProxy.socialCapDivisor,
          engagementProxy.weightSocial
        ]
      );

      if (config.feedRewardsRankingEnabled) {
        res.setHeader("X-Feed-Rank-Modifiers-Active", "1");
        const sampleRate = Number(config.feedRankModifierAnalyticsSampleRate ?? 0);
        if (
          feedAnalytics &&
          typeof feedAnalytics.trackEvent === "function" &&
          sampleRate > 0 &&
          Math.random() < sampleRate
        ) {
          await feedAnalytics.trackEvent("feed_ranking_modifiers_applied", {
            feedTab,
            schemaVersion: 1,
            viewerId: viewerId || null
          });
        }
      }

      const onboardingIntentsApplied = onboardingIntentsForFeed;
      const nowIso = new Date().toISOString();

      const hasMore = result.rows.length > limit;
      const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
      const stripRankModifierInternals = (row) => {
        const cleaned = { ...row };
        delete cleaned.intent_persona_score;
        delete cleaned.boost_tier_unit;
        delete cleaned.rewards_engagement_proxy;
        delete cleaned.conversion_proxy;
        delete cleaned.product_completed_orders;
        delete cleaned.author_open_reports;
        delete cleaned.attached_boost_tier;
        delete cleaned.seller_boost_rank_bonus;
        return cleaned;
      };
      let items = rows.map((row) => {
        const cleaned = stripRankModifierInternals(row);
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
      const canInsertSponsored =
        feedTab !== "reels" && !followingOnly && items.length >= adInsertEvery - 1;
      if (canInsertSponsored) {
        const sponsored = await getSponsoredCampaign({ db, viewerId, feedTab });
        if (sponsored?.kind === "post") {
          const row = sponsored.row;
          if (!items.some((item) => Number(item.id) === Number(row.post_id))) {
            const sponsoredItem = {
              id: row.post_id,
              author_id: row.author_id,
              post_type: row.post_type,
              content: row.content,
              media_url: mediaStorage?.resolveMediaUrl
                ? mediaStorage.resolveMediaUrl({
                    mediaKey: row.media_url,
                    mediaUrl: row.media_url
                  })
                : row.media_url,
              media_mime_type: row.media_mime_type,
              style_tag: row.style_tag,
              tags: row.tags || [],
              created_at: row.created_at,
              author_display_name: row.author_display_name,
              author_avatar_url: mediaStorage?.resolveMediaUrl
                ? mediaStorage.resolveMediaUrl({
                    mediaKey: row.author_avatar_url,
                    mediaUrl: row.author_avatar_url
                  })
                : row.author_avatar_url,
              benefited_count: 0,
              comment_count: 0,
              reflect_later_count: 0,
              is_following_author: false,
              liked_by_viewer: false,
              is_business_post: row.is_business_post,
              cta_label: row.cta_label,
              cta_url: row.cta_url,
              audience_target: row.audience_target,
              business_category: row.business_category,
              sponsored: true,
              sponsored_label: "Sponsored",
              ad_campaign_id: row.campaign_id
            };
            const insertIndex = Math.min(adInsertEvery - 1, items.length);
            items = [...items.slice(0, insertIndex), sponsoredItem, ...items.slice(insertIndex)];
          }
        } else if (sponsored?.kind === "event") {
          const evId = sponsored.event.id;
          const already = items.some((item) => {
            if (item.event && Number(item.event.id) === Number(evId)) {
              return true;
            }
            return typeof item.id === "string" && item.id === `event-${evId}`;
          });
          if (!already) {
            const sponsoredItem = {
              id: `sponsored-event-${sponsored.campaign_id}`,
              post_type: "event",
              card_type: "event",
              event: sponsored.event,
              sponsored: true,
              sponsored_label: "Sponsored",
              ad_campaign_id: sponsored.campaign_id
            };
            const insertIndex = Math.min(adInsertEvery - 1, items.length);
            items = [...items.slice(0, insertIndex), sponsoredItem, ...items.slice(insertIndex)];
          }
        }
      }
      const nextCursor = hasMore ? encodeCursor(rows[rows.length - 1]) : null;
      const eventCandidates = await getRankedEventCandidates({
        db,
        viewerId,
        feedTab,
        limit: config.feedEventCandidatesLimit,
        onboardingIntentsForFeed,
        nowIso
      });
      const eventInsertEvery = Math.max(Number(config.feedEventInsertEvery || 8), 4);
      let mergedEventCount = 0;
      if (includeEvents && eventCandidates.length > 0) {
        const merged = [];
        let postIdx = 0;
        let eventIdx = 0;
        while (postIdx < items.length) {
          merged.push(items[postIdx]);
          postIdx += 1;
          if (postIdx % eventInsertEvery === 0 && eventIdx < eventCandidates.length) {
            merged.push({
              id: `event-${eventCandidates[eventIdx].id}`,
              post_type: "event",
              card_type: "event",
              event: eventCandidates[eventIdx]
            });
            eventIdx += 1;
          }
        }
        items = merged;
        mergedEventCount = eventIdx;
      }

      const rankModifierAudit =
        config.feedRankModifiersDebug && String(req.query.rankModifierAudit || "") === "1"
          ? {
              enabled: Boolean(config.feedRewardsRankingEnabled),
              schemaVersion: 1,
              caps: config.feedRankModifiers || {}
            }
          : undefined;

      res.status(200).json({
        items,
        eventCandidates,
        eventInsertion: {
          enabled: includeEvents,
          insertEvery: eventInsertEvery,
          insertedCount: mergedEventCount
        },
        hasMore,
        nextCursor,
        limit,
        ...(rankModifierAudit ? { rankModifierAudit } : {}),
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
