"use strict";

/**
 * Build file-linked @deenly/rewards-shared (../shared/rewards) after backend `npm ci`.
 *
 * Resolves from this script location (not process.cwd) so paths are stable.
 * In Docker/Nixpacks when the service root is `backend/`, `../shared/rewards` is
 * `/shared/rewards`; `backend/nixpacks.toml` clones the monorepo and symlinks that path.
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
      "Local dev: clone the full monorepo so backend/../shared/rewards exists.\n" +
      "Railway/Nixpacks (root = backend): ensure backend/nixpacks.toml is applied so the install phase creates /shared/rewards before npm ci.\n" +
      "Alternatively set the service Root Directory to the repository root and use the repo-level nixpacks.toml.\n",
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
