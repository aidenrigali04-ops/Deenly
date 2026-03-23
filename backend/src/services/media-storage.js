const crypto = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { httpError } = require("../utils/http-error");

function createMediaStorage(config) {
  const s3Client =
    config.mediaProvider === "s3"
      ? new S3Client({ region: config.awsRegion })
      : null;

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
        uploadUrl: `https://mock-upload.local/${key}`,
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
    createUploadSignature
  };
}

module.exports = {
  createMediaStorage
};
