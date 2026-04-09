const { getSentryExpoConfig } = require("@sentry/react-native/metro");

/** Metro + Sentry debug IDs for symbolicated native/JS stack traces on upload builds. */
module.exports = getSentryExpoConfig(__dirname);
