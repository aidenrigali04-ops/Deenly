function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const corsOriginsRaw = process.env.CORS_ORIGINS || "";
const adminOwnerEmail = String(process.env.ADMIN_OWNER_EMAIL || "").trim().toLowerCase();
const jwtAccessSecret = process.env.JWT_ACCESS_SECRET || "";
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || "";
const frontendApiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const frontendAdminOwner = String(process.env.NEXT_PUBLIC_ADMIN_OWNER_EMAIL || "")
  .trim()
  .toLowerCase();
const frontendOrigin = process.env.FRONTEND_APP_ORIGIN || "";

if (!corsOriginsRaw) {
  fail("CORS_ORIGINS is required");
}
if (!adminOwnerEmail) {
  fail("ADMIN_OWNER_EMAIL is required");
}
if (!jwtAccessSecret || !jwtRefreshSecret) {
  fail("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required");
}
if (!frontendApiBase) {
  fail("NEXT_PUBLIC_API_BASE_URL is required for parity check");
}
if (!frontendAdminOwner) {
  fail("NEXT_PUBLIC_ADMIN_OWNER_EMAIL is required for parity check");
}
if (adminOwnerEmail !== frontendAdminOwner) {
  fail("ADMIN_OWNER_EMAIL and NEXT_PUBLIC_ADMIN_OWNER_EMAIL must match");
}
if (!frontendApiBase.endsWith("/api/v1")) {
  fail("NEXT_PUBLIC_API_BASE_URL must end with /api/v1");
}

if (frontendOrigin) {
  const origins = corsOriginsRaw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!origins.includes(frontendOrigin)) {
    fail("FRONTEND_APP_ORIGIN must be present in CORS_ORIGINS");
  }
}

console.log("verify-deploy-env-parity passed");
