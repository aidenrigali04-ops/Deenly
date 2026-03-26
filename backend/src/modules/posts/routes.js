const express = require("express");
const jwt = require("jsonwebtoken");
const { requireAccessSecret } = require("../../middleware/auth");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { optionalString, requireString } = require("../../utils/validators");
const { httpError } = require("../../utils/http-error");

const POST_TYPES = new Set(["recitation", "community", "short_video"]);
const PRODUCT_TYPES = new Set(["digital", "service", "subscription"]);
const AUDIENCE_TARGETS = new Set(["b2b", "b2c", "both"]);

function createPostsRouter({ db, config, analytics, mediaStorage }) {
  async function getViewerIdFromAuthHeader(authorization) {
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
      return userId || null;
    } catch {
      return null;
    }
  }

  const router = express.Router();
  const authMiddleware = authenticate({
    config: config || { jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "" },
    db
  });

  function validateBusinessFields(body) {
    const isBusinessPost = Boolean(body?.isBusinessPost);
    const ctaLabel = optionalString(body?.ctaLabel, "ctaLabel", 80) || null;
    const ctaUrl = optionalString(body?.ctaUrl, "ctaUrl", 2000) || null;
    if ((ctaLabel && !ctaUrl) || (!ctaLabel && ctaUrl)) {
      throw httpError(400, "ctaLabel and ctaUrl must be provided together");
    }
    if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) {
      throw httpError(400, "ctaUrl must be an absolute http(s) URL");
    }
    return { isBusinessPost, ctaLabel, ctaUrl };
  }

  function parseTags(rawTags) {
    if (!rawTags) {
      return [];
    }
    if (Array.isArray(rawTags)) {
      return rawTags
        .map((tag) => String(tag || "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10)
        .map((tag) => tag.slice(0, 32));
    }
    if (typeof rawTags === "string") {
      return rawTags
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10)
        .map((tag) => tag.slice(0, 32));
    }
    throw httpError(400, "tags must be an array or comma-separated string");
  }

  function validateSellThis(input) {
    const sellThis = Boolean(input?.sellThis);
    if (!sellThis) {
      return { sellThis: false };
    }
    const productType = String(input?.productType || "digital").trim().toLowerCase();
    if (!PRODUCT_TYPES.has(productType)) {
      throw httpError(400, "productType must be digital, service, or subscription");
    }
    const priceMinor = Number(input?.priceMinor);
    if (!Number.isInteger(priceMinor) || priceMinor <= 0) {
      throw httpError(400, "priceMinor must be a positive integer");
    }
    const deliveryMethod = optionalString(input?.deliveryMethod, "deliveryMethod", 120) || null;
    const serviceDetails = optionalString(input?.serviceDetails, "serviceDetails", 2000) || null;
    const websiteUrl = optionalString(input?.websiteUrl, "websiteUrl", 2000) || null;
    if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) {
      throw httpError(400, "websiteUrl must be an absolute http(s) URL");
    }
    const deliveryMediaKey = optionalString(input?.deliveryMediaKey, "deliveryMediaKey", 512) || null;
    if (productType === "digital" && !deliveryMediaKey) {
      throw httpError(400, "deliveryMediaKey is required for digital products");
    }
    return {
      sellThis: true,
      productType,
      priceMinor,
      deliveryMethod,
      serviceDetails,
      websiteUrl,
      deliveryMediaKey
    };
  }

  function parseAudienceTarget(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      return "both";
    }
    const target = String(rawValue).trim().toLowerCase();
    if (!AUDIENCE_TARGETS.has(target)) {
      throw httpError(400, "audienceTarget must be b2b, b2c, or both");
    }
    return target;
  }

  function parseBusinessCategory(rawValue) {
    const value = optionalString(rawValue, "businessCategory", 64);
    return value ? value.trim().toLowerCase() : null;
  }

  router.post(
    "/",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const restriction = await db.query(
        `SELECT id
         FROM user_restrictions
         WHERE user_id = $1
           AND is_active = true
           AND restriction_type IN ('posting_suspended', 'account_suspended')
           AND (ends_at IS NULL OR ends_at > NOW())
         LIMIT 1`,
        [req.user.id]
      );
      if (restriction.rowCount > 0) {
        throw httpError(403, "Posting is temporarily restricted");
      }

      const postType = requireString(req.body?.postType, "postType", 3, 32);
      if (!POST_TYPES.has(postType)) {
        throw httpError(400, "postType must be recitation, community, or short_video");
      }

      const content = requireString(req.body?.content, "content", 1, 2000);
      if (
        config.commentBlockedTerms?.length &&
        config.commentBlockedTerms.some((term) =>
          content.toLowerCase().includes(String(term || "").toLowerCase())
        )
      ) {
        throw httpError(400, "Post contains blocked language");
      }
      const mediaUrl = optionalString(req.body?.mediaUrl, "mediaUrl", 2048);
      const styleTag = optionalString(req.body?.styleTag, "styleTag", 64);
      const tags = parseTags(req.body?.tags);
      const { isBusinessPost, ctaLabel, ctaUrl } = validateBusinessFields(req.body);
      const sellThis = validateSellThis(req.body?.sellThisConfig || req.body);
      const audienceTarget = parseAudienceTarget(req.body?.audienceTarget);
      const businessCategory = parseBusinessCategory(req.body?.businessCategory);

      await db.query("BEGIN");
      let result;
      try {
        result = await db.query(
          `INSERT INTO posts (
             author_id, post_type, content, media_url, style_tag, media_status, is_business_post, cta_label, cta_url, tags
           , audience_target, business_category
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11, $12)
           RETURNING id, author_id, post_type, content, media_url, media_mime_type, style_tag, media_status,
                     visibility_status, is_business_post, cta_label, cta_url, tags, audience_target, business_category, created_at, updated_at`,
          [
            req.user.id,
            postType,
            content,
            mediaUrl,
            styleTag,
            "ready",
            isBusinessPost,
            ctaLabel,
            ctaUrl,
            tags,
            audienceTarget,
            businessCategory
          ]
        );
        if (sellThis.sellThis) {
          const title =
            optionalString(req.body?.productTitle, "productTitle", 180) ||
            `${postType.replace("_", " ")} by ${req.user.username || "creator"}`;
          const description =
            optionalString(req.body?.productDescription, "productDescription", 2000) ||
            optionalString(content, "content", 2000);
          const product = await db.query(
            `INSERT INTO creator_products (
               creator_user_id,
               title,
               description,
               price_minor,
               currency,
               delivery_media_key,
               product_type,
               service_details,
               delivery_method,
               website_url,
               status
             )
             VALUES ($1, $2, $3, $4, 'usd', $5, $6, $7, $8, $9, 'published')
             RETURNING id`,
            [
              req.user.id,
              title,
              description || null,
              sellThis.priceMinor,
              sellThis.deliveryMediaKey,
              sellThis.productType,
              sellThis.serviceDetails,
              sellThis.deliveryMethod,
              sellThis.websiteUrl
            ]
          );
          await db.query(
            `INSERT INTO post_product_links (post_id, product_id)
             VALUES ($1, $2)
             ON CONFLICT (post_id)
             DO UPDATE SET product_id = EXCLUDED.product_id`,
            [result.rows[0].id, product.rows[0].id]
          );
        }
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }
      if (analytics) {
        await analytics.trackEvent("create_post", {
          userId: req.user.id,
          postId: result.rows[0].id,
          postType
        });
        await analytics.trackEvent("post_create", {
          userId: req.user.id,
          postId: result.rows[0].id,
          postType,
          isBusinessPost,
          sellThis: sellThis.sellThis
        });
      }

      res.status(201).json(result.rows[0]);
    })
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const postType = req.query.postType || null;
      const authorId = req.query.authorId ? Number(req.query.authorId) : null;
      const mediaOnly = String(req.query.mediaOnly || "false") === "true";
      const videoOnly = String(req.query.videoOnly || "false") === "true";

      if (postType && !POST_TYPES.has(postType)) {
        throw httpError(400, "postType must be recitation, community, or short_video");
      }
      if (req.query.authorId && !authorId) {
        throw httpError(400, "authorId must be a number");
      }

      const result = await db.query(
        `SELECT p.id, p.author_id, p.post_type, p.content, p.media_url, p.media_mime_type, p.style_tag, p.media_status,
                p.visibility_status, p.created_at, p.updated_at,
                p.is_business_post, p.cta_label, p.cta_url, p.tags, p.audience_target, p.business_category,
                pr.display_name AS author_display_name,
                cpr.id AS attached_product_id,
                cpr.title AS attached_product_title,
                cpr.price_minor AS attached_product_price_minor,
                cpr.currency AS attached_product_currency,
                cpr.product_type AS attached_product_type,
                cpr.website_url AS attached_product_website_url,
                COALESCE(ia.benefited_count, 0)::int AS benefited_count,
                COALESCE(ia.comment_count, 0)::int AS comment_count,
                COALESCE(ia.reflect_later_count, 0)::int AS reflect_later_count,
                COALESCE(vs.view_count, 0)::int AS view_count,
                COALESCE(vs.avg_watch_time_ms, 0)::int AS avg_watch_time_ms,
                COALESCE(vs.avg_completion_rate, 0)::numeric AS avg_completion_rate
         FROM posts p
         JOIN profiles pr ON pr.user_id = p.author_id
         LEFT JOIN post_product_links ppl ON ppl.post_id = p.id
         LEFT JOIN creator_products cpr
           ON cpr.id = ppl.product_id
          AND cpr.status = 'published'
         LEFT JOIN (
           SELECT post_id,
                  COUNT(*) FILTER (WHERE interaction_type = 'benefited' AND deleted_at IS NULL)::int AS benefited_count,
                  COUNT(*) FILTER (WHERE interaction_type = 'comment' AND deleted_at IS NULL)::int AS comment_count,
                  COUNT(*) FILTER (WHERE interaction_type = 'reflect_later' AND deleted_at IS NULL)::int AS reflect_later_count
           FROM interactions
           GROUP BY post_id
         ) ia ON ia.post_id = p.id
         LEFT JOIN (
           SELECT post_id,
                  COUNT(*)::int AS view_count,
                  AVG(watch_time_ms)::int AS avg_watch_time_ms,
                  ROUND(AVG(completion_rate), 2) AS avg_completion_rate
           FROM post_views
           GROUP BY post_id
         ) vs ON vs.post_id = p.id
         WHERE ($1::text IS NULL OR p.post_type = $1::text)
           AND ($2::int IS NULL OR p.author_id = $2::int)
           AND ($5::boolean = false OR p.media_url IS NOT NULL)
           AND ($6::boolean = false OR p.media_mime_type LIKE 'video/%')
           AND p.visibility_status = 'visible'
           AND p.removed_at IS NULL
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT $3 OFFSET $4`,
        [postType, authorId, limit, offset, mediaOnly, videoOnly]
      );

      const items = result.rows.map((row) => ({
        ...row,
        media_url: mediaStorage?.resolveMediaUrl
          ? mediaStorage.resolveMediaUrl({
              mediaKey: row.media_upload_key || row.media_url,
              mediaUrl: row.media_url
            })
          : row.media_url
      }));
      res.status(200).json({ limit, offset, mediaOnly, videoOnly, items });
    })
  );

  router.get(
    "/:postId",
    asyncHandler(async (req, res) => {
      const postId = Number(req.params.postId);
      const viewerId = await getViewerIdFromAuthHeader(req.headers.authorization);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }

      const result = await db.query(
        `SELECT p.id, p.author_id, p.post_type, p.content, p.media_url, p.media_mime_type, p.style_tag, p.media_status, p.visibility_status, p.created_at, p.updated_at,
                p.is_business_post, p.cta_label, p.cta_url, p.tags, p.audience_target, p.business_category,
                pr.display_name AS author_display_name,
                cpr.id AS attached_product_id,
                cpr.title AS attached_product_title,
                cpr.price_minor AS attached_product_price_minor,
                cpr.currency AS attached_product_currency,
                cpr.product_type AS attached_product_type,
                cpr.website_url AS attached_product_website_url,
                COALESCE(ia.benefited_count, 0)::int AS benefited_count,
                COALESCE(ia.comment_count, 0)::int AS comment_count,
                COALESCE(ia.reflect_later_count, 0)::int AS reflect_later_count,
                COALESCE(vs.view_count, 0)::int AS view_count,
                COALESCE(vs.avg_watch_time_ms, 0)::int AS avg_watch_time_ms,
                COALESCE(vs.avg_completion_rate, 0)::numeric AS avg_completion_rate,
                CASE
                  WHEN $2::int IS NULL THEN false
                  ELSE EXISTS (
                    SELECT 1
                    FROM interactions li
                    WHERE li.user_id = $2
                      AND li.post_id = p.id
                      AND li.interaction_type = 'benefited'
                      AND li.deleted_at IS NULL
                  )
                END AS liked_by_viewer
         FROM posts p
         JOIN profiles pr ON pr.user_id = p.author_id
         LEFT JOIN post_product_links ppl ON ppl.post_id = p.id
         LEFT JOIN creator_products cpr
           ON cpr.id = ppl.product_id
          AND cpr.status = 'published'
         LEFT JOIN (
           SELECT post_id,
                  COUNT(*) FILTER (WHERE interaction_type = 'benefited' AND deleted_at IS NULL)::int AS benefited_count,
                  COUNT(*) FILTER (WHERE interaction_type = 'comment' AND deleted_at IS NULL)::int AS comment_count,
                  COUNT(*) FILTER (WHERE interaction_type = 'reflect_later' AND deleted_at IS NULL)::int AS reflect_later_count
           FROM interactions
           GROUP BY post_id
         ) ia ON ia.post_id = p.id
         LEFT JOIN (
           SELECT post_id,
                  COUNT(*)::int AS view_count,
                  AVG(watch_time_ms)::int AS avg_watch_time_ms,
                  ROUND(AVG(completion_rate), 2) AS avg_completion_rate
           FROM post_views
           GROUP BY post_id
         ) vs ON vs.post_id = p.id
         WHERE p.id = $1
           AND p.visibility_status = 'visible'
           AND p.removed_at IS NULL
         LIMIT 1`,
        [postId, viewerId]
      );

      if (result.rowCount === 0) {
        throw httpError(404, "Post not found");
      }

      const row = result.rows[0];
      res.status(200).json({
        ...row,
        media_url: mediaStorage?.resolveMediaUrl
          ? mediaStorage.resolveMediaUrl({
              mediaKey: row.media_upload_key || row.media_url,
              mediaUrl: row.media_url
            })
          : row.media_url
      });
    })
  );

  router.delete(
    "/:postId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const postId = Number(req.params.postId);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }
      const deleted = await db.query(
        `UPDATE posts
         SET visibility_status = 'hidden',
             removed_at = NOW(),
             removed_by = $2,
             updated_at = NOW()
         WHERE id = $1
           AND author_id = $2
           AND removed_at IS NULL
         RETURNING id`,
        [postId, req.user.id]
      );
      if (deleted.rowCount === 0) {
        throw httpError(404, "Post not found");
      }
      if (analytics) {
        await analytics.trackEvent("delete_post", {
          userId: req.user.id,
          postId
        });
      }
      res.status(200).json({ deleted: true, postId });
    })
  );

  return router;
}

module.exports = {
  createPostsRouter
};
