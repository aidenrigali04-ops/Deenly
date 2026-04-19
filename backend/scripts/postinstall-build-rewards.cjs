"use strict";

/**
 * Build file-linked @deenly/rewards-shared (../shared/rewards) after backend npm ci.
 * Resolves paths from this script's location so it works even when process.cwd() is wrong.
 * Requires the monorepo layout: repo/backend/scripts → repo/shared/rewards
 * (deploy with Docker/Railway build context = repo root, not only backend/).
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const backendRoot = path.resolve(__dirname, "..");
const rewardsDir = path.resolve(backendRoot, "..", "shared", "rewards");
const rewardsPkg = path.join(rewardsDir, "package.json");

if (!fs.existsSync(rewardsPkg)) {
  console.error(
    "[deenly-backend postinstall] Expected shared rewards at:\n  %s\n\n" +
      "Deploy from the monorepo root so backend/../shared/rewards exists. " +
      "On Railway: set the service Root Directory to \".\" (repository root), not \"backend\". " +
      "See backend/README.md → Railway Deployment.\n",
    rewardsDir
  );
  process.exit(1);
}

const devEnv = {
  ...process.env,
  NPM_CONFIG_PRODUCTION: "false",
  NODE_ENV: process.env.NODE_ENV || "development"
};

const tscMarker = path.join(rewardsDir, "node_modules", "typescript");
if (!fs.existsSync(tscMarker)) {
  const ci = spawnSync("npm", ["ci", "--include=dev"], {
    cwd: rewardsDir,
    stdio: "inherit",
    env: devEnv,
    shell: process.platform === "win32"
  });
  if ((ci.status ?? 1) !== 0) {
    process.exit(ci.status ?? 1);
  }
}

const build = spawnSync("npm", ["run", "build"], {
  cwd: rewardsDir,
  stdio: "inherit",
  env: devEnv,
  shell: process.platform === "win32"
});

if ((build.status ?? 1) !== 0) {
  process.exit(build.status ?? 1);
}
