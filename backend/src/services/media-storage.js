const crypto = require("crypto");
const { URL } = require("node:url");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { httpError } = require("../utils/http-error");

function createMediaStorage(config) {
  const s3Client =
    config.mediaProvider === "s3"
      ? new S3Client({ region: config.awsRegion })
      : null;

  const mockUploadBaseUrl =
    config.mockUploadBaseUrl || `http://localhost:${config.port}`;

  function normalizeKeyLikeValue(value) {
    const raw = String(value || "").trim().replace(/^\/+/, "");
    if (!raw) {
      return "";
    }
    if (/^https?:\/\//i.test(raw)) {
      return "";
    }
    return raw;
  }

  function buildPublicMediaUrl(key) {
    const normalizedKey = normalizeKeyLikeValue(key);
    if (!normalizedKey) {
      return "";
    }
    if (config.mediaPublicBaseUrl) {
      return `${config.mediaPublicBaseUrl}/${normalizedKey}`;
    }
    return "";
  }

  function resolveMediaUrl({ mediaKey, mediaUrl }) {
    const directUrl = String(mediaUrl || "").trim();
    if (directUrl && /^https?:\/\//i.test(directUrl)) {
      let parsed = null;
      let publicBaseHost = null;
      try {
        parsed = new URL(directUrl);
      } catch {
        parsed = null;
      }
      try {
        publicBaseHost = config.mediaPublicBaseUrl ? new URL(config.mediaPublicBaseUrl).host : null;
      } catch {
        publicBaseHost = null;
      }

      if (parsed && config.mediaPublicBaseUrl) {
        if (publicBaseHost && parsed.host === publicBaseHost) {
          return directUrl;
        }
        const rawPath = parsed.pathname.replace(/^\/+/, "");
        let extractedKey = "";
        const uploadsMarker = rawPath.indexOf("uploads/");
        if (uploadsMarker >= 0) {
          extractedKey = rawPath.slice(uploadsMarker);
        } else if (config.awsS3Bucket && rawPath.startsWith(`${config.awsS3Bucket}/`)) {
          extractedKey = rawPath.slice(config.awsS3Bucket.length + 1);
        }
        const normalizedFromUrl = buildPublicMediaUrl(extractedKey);
        if (normalizedFromUrl) {
          return normalizedFromUrl;
        }
      }
      return directUrl;
    }
    const keyCandidate = normalizeKeyLikeValue(directUrl) || normalizeKeyLikeValue(mediaKey);
    const resolved = buildPublicMediaUrl(keyCandidate);
    return resolved || keyCandidate || directUrl;
  }

  async function createUploadSignature({
    userId,
    mediaType,
    mimeType,
    fileSizeBytes,
    originalFilename
  }) {
    if (!config.mediaAllowedMimeTypes.includes(mimeType)) {
      throw httpError(400, "Unsupported media mime type");
    }

    if (fileSizeBytes > config.mediaMaxUploadBytes) {
      throw httpError(400, "File exceeds max upload size");
    }

    const sanitizedName = String(originalFilename || "upload.bin")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-120);

    const key = `uploads/${userId}/${Date.now()}-${crypto
      .randomBytes(8)
      .toString("hex")}-${sanitizedName}`;

    if (config.mediaProvider === "mock") {
      return {
        provider: "mock",
        key,
        method: "PUT",
        uploadUrl: `${mockUploadBaseUrl}/mock-upload/${key}`,
        headers: {
          "content-type": mimeType
        },
        expiresInSeconds: 900,
        constraints: {
          mediaType,
          mimeType,
          maxBytes: config.mediaMaxUploadBytes
        }
      };
    }

    const command = new PutObjectCommand({
      Bucket: config.awsS3Bucket,
      Key: key,
      ContentType: mimeType
    });
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    return {
      provider: "s3",
      key,
      method: "PUT",
      uploadUrl,
      headers: {
        "content-type": mimeType
      },
      expiresInSeconds: 900,
      constraints: {
        mediaType,
        mimeType,
        maxBytes: config.mediaMaxUploadBytes
      }
    };
  }

  return {
    createUploadSignature,
    resolveMediaUrl
  };
}

module.exports = {
  createMediaStorage
};
