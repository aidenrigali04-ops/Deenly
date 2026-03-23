const fs = require("fs");
const path = require("path");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseEnvKeys(content) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.split("=")[0].trim());
}

function main() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const backendEnv = read(path.join(repoRoot, "backend/.env.example"));
  const frontendEnv = read(path.join(repoRoot, "frontend/.env.example"));
  const backendReadme = read(path.join(repoRoot, "backend/README.md"));
  const openapi = read(path.join(repoRoot, "backend/openapi.yaml"));
  const checklist = path.join(repoRoot, "backend/RELEASE_CHECKLIST.md");

  if (!fs.existsSync(checklist)) {
    fail("backend/RELEASE_CHECKLIST.md is required.");
  }

  const backendKeys = parseEnvKeys(backendEnv);
  const frontendKeys = parseEnvKeys(frontendEnv);

  const requiredBackend = [
    "CORS_ORIGINS",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "ADMIN_OWNER_EMAIL"
  ];
  for (const key of requiredBackend) {
    if (!backendKeys.includes(key)) {
      fail(`Missing ${key} in backend/.env.example`);
    }
  }

  if (!frontendKeys.includes("NEXT_PUBLIC_API_BASE_URL")) {
    fail("Missing NEXT_PUBLIC_API_BASE_URL in frontend/.env.example");
  }

  const frozenRoutes = ["/api/v1/auth", "/api/v1/users", "/api/v1/posts", "/api/v1/feed", "/api/v1/interactions", "/api/v1/reports"];
  for (const route of frozenRoutes) {
    if (!backendReadme.includes(route)) {
      fail(`README must document frozen route contract: ${route}`);
    }
  }

  if (!openapi.includes("openapi: 3.0")) {
    fail("OpenAPI spec must remain version 3.0");
  }

  console.log("verify-env-and-contract passed");
}

main();
