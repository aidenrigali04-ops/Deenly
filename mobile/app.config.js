/**
 * Dynamic Expo config: extends static app.json and injects optional Android Google Maps API key
 * (set GOOGLE_MAPS_ANDROID_API_KEY in EAS secrets for production Android builds).
 */
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() ?? "";
  const android = { ...config.android };
  if (mapsKey) {
    android.config = { ...(android.config || {}), googleMaps: { apiKey: mapsKey } };
  }
  return {
    ...config,
    android
  };
};
