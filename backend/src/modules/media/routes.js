const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { requireString } = require("../../utils/validators");

const ALLOWED_MEDIA_TYPES = new Set(["image", "video"]);

function createMediaRouter({ db, config, mediaStorage, analytics }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  if (!mediaStorage) {
    throw new Error("mediaStorage is required");
  }

  router.post(
    "/upload-signature",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const mediaType = requireString(req.body?.mediaType, "mediaType", 3, 32);
      if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
        throw httpError(400, "mediaType must be image or video");
      }
      const mimeType = requireString(req.body?.mimeType, "mimeType", 3, 128);
      if (!mimeType.startsWith(`${mediaType}/`)) {
        throw httpError(400, "mimeType must match mediaType");
      }
      const originalFilename = requireString(
        req.body?.originalFilename || "upload.bin",
        "originalFilename",
        1,
        255
      );
      const fileSizeBytes = Number(req.body?.fileSizeBytes);
      if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
        throw httpError(400, "fileSizeBytes must be a positive number");
      }

      const signature = await mediaStorage.createUploadSignature({
        userId: req.user.id,
        mediaType,
        mimeType,
        fileSizeBytes,
        originalFilename
      });

      if (analytics) {
        await analytics.trackEvent("media_upload_signature_created", {
          userId: req.user.id,
          mediaType,
          mimeType
        });
      }

      res.status(200).json(signature);
    })
  );

  router.post(
    "/posts/:postId/attach",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const postId = Number(req.params.postId);
      const mediaKey = requireString(req.body?.mediaKey, "mediaKey", 5, 512);
      const inputMediaUrl = req.body?.mediaUrl ? String(req.body.mediaUrl) : mediaKey;
      const mimeType = requireString(req.body?.mimeType, "mimeType", 3, 128);
      const fileSizeBytes = Number(req.body?.fileSizeBytes);
      const durationSeconds = req.body?.durationSeconds
        ? Number(req.body.durationSeconds)
        : null;

      if (!postId) {
        throw httpError(400, "postId must be a number");
      }
      if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
        throw httpError(400, "fileSizeBytes must be a positive number");
      }
      if (!config.mediaAllowedMimeTypes.includes(mimeType)) {
        throw httpError(400, "Unsupported media mime type");
      }
      if (fileSizeBytes > config.mediaMaxUploadBytes) {
        throw httpError(400, "File exceeds max upload size");
      }
      if (
        durationSeconds !== null &&
        (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
      ) {
        throw httpError(400, "durationSeconds must be a positive number");
      }
      const mediaUrl = mediaStorage.resolveMediaUrl({
        mediaKey,
        mediaUrl: inputMediaUrl
      });

      const result = await db.query(
        `UPDATE posts
         SET media_upload_key = $1,
             media_url = $2,
             media_mime_type = $3,
             media_size_bytes = $4,
             media_duration_seconds = $5,
             media_status = 'processing',
             media_processed_at = NULL,
             media_processing_error = NULL,
             updated_at = NOW()
         WHERE id = $6
           AND author_id = $7
         RETURNING id, media_upload_key, media_url, media_mime_type, media_status, media_processed_at, updated_at`,
        [mediaKey, mediaUrl, mimeType, fileSizeBytes, durationSeconds, postId, req.user.id]
      );

      if (result.rowCount === 0) {
        throw httpError(404, "Post not found");
      }

      if (analytics) {
        await analytics.trackEvent("media_attached_to_post", {
          userId: req.user.id,
          postId
        });
      }

      res.status(200).json(result.rows[0]);
    })
  );

  router.post(
    "/processing/post/:postId",
    asyncHandler(async (req, res) => {
      const token = req.headers["x-processing-token"];
      if (!config.processingWebhookToken || token !== config.processingWebhookToken) {
        throw httpError(401, "Invalid processing token");
      }

      const postId = Number(req.params.postId);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }

      const status = requireString(req.body?.status, "status", 4, 16);
      if (!["ready", "failed"].includes(status)) {
        throw httpError(400, "status must be ready or failed");
      }

      const mediaUrl = req.body?.mediaUrl ? String(req.body.mediaUrl) : null;
      const processingError = req.body?.errorMessage
        ? String(req.body.errorMessage).slice(0, 500)
        : null;

      const normalizedMediaUrl = mediaUrl
        ? mediaStorage.resolveMediaUrl({
            mediaKey: mediaUrl,
            mediaUrl
          })
        : null;

      const result = await db.query(
        `UPDATE posts
         SET media_status = $1,
             media_url = COALESCE($2, media_url),
             media_processing_error = $3,
             media_processed_at = NOW(),
             updated_at = NOW()
         WHERE id = $4
         RETURNING id, media_status, media_url, media_processing_error, media_processed_at`,
        [status, normalizedMediaUrl, processingError, postId]
      );

      if (result.rowCount === 0) {
        throw httpError(404, "Post not found");
      }

      res.status(200).json(result.rows[0]);
    })
  );

  return router;
}

module.exports = {
  createMediaRouter
};
