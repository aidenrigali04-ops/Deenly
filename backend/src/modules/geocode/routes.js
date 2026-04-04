const express = require("express");
const rateLimit = require("express-rate-limit");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { requireString } = require("../../utils/validators");

const NOMINATIM = "https://nominatim.openstreetmap.org";

function createGeocodeRouter() {
  const router = express.Router();
  /** Nominatim usage policy: identify the application; keep request rate modest. */
  const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test"
  });

  router.get(
    "/search",
    searchLimiter,
    asyncHandler(async (req, res) => {
      const q = requireString(req.query.q, "q", 2, 280);
      const url = new URL(`${NOMINATIM}/search`);
      url.searchParams.set("format", "json");
      url.searchParams.set("q", q);
      url.searchParams.set("limit", "5");

      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": "Deenly/1.0 (https://deenly.app; event geocoding)"
        }
      });
      if (!response.ok) {
        throw httpError(502, "Geocoding service unavailable");
      }
      const raw = await response.json();
      if (!Array.isArray(raw)) {
        throw httpError(502, "Invalid geocoding response");
      }
      const items = raw
        .map((row) => {
          const lat = Number(row.lat);
          const lng = Number(row.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null;
          }
          return {
            label: String(row.display_name || "").slice(0, 500),
            latitude: lat,
            longitude: lng
          };
        })
        .filter(Boolean);

      res.status(200).json({ items });
    })
  );

  router.get(
    "/reverse",
    searchLimiter,
    asyncHandler(async (req, res) => {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw httpError(400, "lat and lng must be numbers");
      }
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw httpError(400, "lat/lng out of range");
      }
      const url = new URL(`${NOMINATIM}/reverse`);
      url.searchParams.set("format", "json");
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lng));

      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": "Deenly/1.0 (https://deenly.app; event geocoding)"
        }
      });
      if (!response.ok) {
        throw httpError(502, "Geocoding service unavailable");
      }
      const row = await response.json();
      const label = row?.display_name ? String(row.display_name).slice(0, 500) : null;
      res.status(200).json({
        label,
        latitude: lat,
        longitude: lng
      });
    })
  );

  return router;
}

module.exports = {
  createGeocodeRouter
};
