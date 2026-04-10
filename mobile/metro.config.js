const path = require("path");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

/** Metro + Sentry debug IDs for symbolicated native/JS stack traces on upload builds. */
const projectRoot = __dirname;
const config = getSentryExpoConfig(projectRoot);

// npm dedupes @expo/log-box to root; some tooling still resolves expo/node_modules/@expo/log-box (ENOENT).
config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...(config.resolver?.extraNodeModules || {}),
    "@expo/log-box": path.resolve(projectRoot, "node_modules/@expo/log-box")
  }
};

module.exports = config;
