const appJson = require("./app.json");

/**
 * Dynamic Expo config: merges static app.json with optional Android Google Maps API key
 * (set GOOGLE_MAPS_ANDROID_API_KEY in EAS secrets for production Android builds).
 */
module.exports = () => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() ?? "";
  const expo = { ...appJson.expo };
  const android = { ...expo.android };
  if (mapsKey) {
    android.config = { ...(android.config || {}), googleMaps: { apiKey: mapsKey } };
  }
  return { expo: { ...expo, android } };
};
