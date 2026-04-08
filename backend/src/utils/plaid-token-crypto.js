const crypto = require("node:crypto");

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey(config) {
  const raw = String(config.plaidTokenEncryptionKey || "").trim();
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, "hex");
    }
    try {
      const buf = Buffer.from(raw, "base64");
      if (buf.length === 32) {
        return buf;
      }
    } catch {
      // fall through
    }
    throw new Error("PLAID_TOKEN_ENCRYPTION_KEY must be 32-byte base64 or 64 hex chars");
  }
  const seed =
    String(config.jwtRefreshSecret || config.jwtAccessSecret || "").trim() || "plaid-dev-token-key";
  return crypto.createHash("sha256").update(seed, "utf8").digest();
}

function encryptPlaidSecret(plaintext, config) {
  const key = deriveKey(config);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptPlaidSecret(ciphertextB64, config) {
  const key = deriveKey(config);
  const buf = Buffer.from(String(ciphertextB64 || ""), "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Invalid encrypted Plaid token payload");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

module.exports = {
  encryptPlaidSecret,
  decryptPlaidSecret
};
