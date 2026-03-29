const crypto = require("crypto");
const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { optionalString, optionalWebsiteUrl, requireString } = require("../../utils/validators");

function baseSlugFromName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function createBusinessesRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({
    config: config || { jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "" },
    db
  });

  function rowToPublic(row) {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      websiteUrl: row.website_url,
      addressDisplay: row.address_display,
      latitude: row.latitude,
      longitude: row.longitude,
      category: row.category,
      visibility: row.visibility,
      ownerUserId: row.owner_user_id,
      distanceM: row.distance_m != null ? Number(row.distance_m) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  router.get(
    "/near",
    asyncHandler(async (req, res) => {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const radiusM = Math.min(Math.max(Number(req.query.radiusM) || 5000, 100), 100_000);
      const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw httpError(400, "lat and lng must be numbers");
      }
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw httpError(400, "lat/lng out of range");
      }

      const result = await db.query(
        `SELECT id, owner_user_id, name, slug, description, website_url, address_display,
                latitude, longitude, category, visibility, created_at, updated_at,
                (
                  6371000 * acos(
                    LEAST(1.0, GREATEST(-1.0,
                      cos(radians($1::float8)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2::float8))
                      + sin(radians($1::float8)) * sin(radians(latitude))
                    ))
                  )
                )::float8 AS distance_m
         FROM business_listings
         WHERE visibility = 'published'
           AND (
             6371000 * acos(
               LEAST(1.0, GREATEST(-1.0,
                 cos(radians($1::float8)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2::float8))
                 + sin(radians($1::float8)) * sin(radians(latitude))
               ))
             )
           ) <= $3::float8
         ORDER BY distance_m ASC
         LIMIT $4`,
        [lat, lng, radiusM, limit]
      );

      res.status(200).json({
        items: result.rows.map(rowToPublic)
      });
    })
  );

  router.get(
    "/mine",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT id, owner_user_id, name, slug, description, website_url, contact_email, contact_phone,
                address_display, latitude, longitude, category, visibility, created_at, updated_at
         FROM business_listings
         WHERE owner_user_id = $1
         ORDER BY updated_at DESC`,
        [req.user.id]
      );
      res.status(200).json({
        items: result.rows.map((row) => ({
          ...rowToPublic(row),
          contactEmail: row.contact_email,
          contactPhone: row.contact_phone
        }))
      });
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        throw httpError(400, "id must be a number");
      }
      const result = await db.query(
        `SELECT id, owner_user_id, name, slug, description, website_url, contact_email, contact_phone,
                address_display, latitude, longitude, category, visibility, created_at, updated_at
         FROM business_listings
         WHERE id = $1
         LIMIT 1`,
        [id]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "Business not found");
      }
      const row = result.rows[0];
      let viewerId = null;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const jwt = require("jsonwebtoken");
          const { requireAccessSecret } = require("../../middleware/auth");
          const payload = jwt.verify(authHeader.slice("Bearer ".length), requireAccessSecret(config));
          viewerId = Number(payload.sub) || null;
        } catch {
          viewerId = null;
        }
      }
      if (row.visibility !== "published" && row.owner_user_id !== viewerId) {
        throw httpError(404, "Business not found");
      }
      const pub = rowToPublic(row);
      if (row.owner_user_id === viewerId) {
        pub.contactEmail = row.contact_email;
        pub.contactPhone = row.contact_phone;
      }
      res.status(200).json(pub);
    })
  );

  router.post(
    "/",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const name = requireString(req.body?.name, "name", 2, 120);
      const description = optionalString(req.body?.description, "description", 4000);
      const websiteUrl = optionalWebsiteUrl(req.body?.websiteUrl, "websiteUrl", 2048);
      const addressDisplay = optionalString(req.body?.addressDisplay, "addressDisplay", 500);
      const category = optionalString(req.body?.category, "category", 64);
      const contactEmail = optionalString(req.body?.contactEmail, "contactEmail", 254);
      const contactPhone = optionalString(req.body?.contactPhone, "contactPhone", 32);
      const latitude = Number(req.body?.latitude);
      const longitude = Number(req.body?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw httpError(400, "latitude and longitude must be numbers");
      }
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        throw httpError(400, "latitude/longitude out of range");
      }
      const visibilityRaw = optionalString(req.body?.visibility, "visibility", 16) || "draft";
      if (!["draft", "published"].includes(visibilityRaw)) {
        throw httpError(400, "visibility must be draft or published");
      }

      let slugBase = baseSlugFromName(name) || "business";
      let slug = `${slugBase}-${crypto.randomBytes(4).toString("hex")}`;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const insert = await db.query(
            `INSERT INTO business_listings (
               owner_user_id, name, slug, description, website_url, contact_email, contact_phone,
               address_display, latitude, longitude, category, visibility, updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
             RETURNING id, owner_user_id, name, slug, description, website_url, contact_email, contact_phone,
                       address_display, latitude, longitude, category, visibility, created_at, updated_at`,
            [
              req.user.id,
              name,
              slug,
              description,
              websiteUrl,
              contactEmail,
              contactPhone,
              addressDisplay,
              latitude,
              longitude,
              category,
              visibilityRaw
            ]
          );
          res.status(201).json(rowToPublic(insert.rows[0]));
          return;
        } catch (err) {
          if (err?.code === "23505") {
            slug = `${slugBase}-${crypto.randomBytes(6).toString("hex")}`;
            continue;
          }
          throw err;
        }
      }
      throw httpError(500, "Could not allocate unique slug");
    })
  );

  router.patch(
    "/:id",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        throw httpError(400, "id must be a number");
      }
      const existing = await db.query(
        `SELECT id, owner_user_id FROM business_listings WHERE id = $1 LIMIT 1`,
        [id]
      );
      if (existing.rowCount === 0) {
        throw httpError(404, "Business not found");
      }
      if (existing.rows[0].owner_user_id !== req.user.id) {
        throw httpError(403, "Not allowed to update this listing");
      }

      const body = req.body || {};
      const sets = [];
      const vals = [];
      let i = 1;

      if (Object.prototype.hasOwnProperty.call(body, "name")) {
        sets.push(`name = $${i}`);
        vals.push(requireString(body.name, "name", 2, 120));
        i += 1;
      }
      if (Object.prototype.hasOwnProperty.call(body, "description")) {
        sets.push(`description = $${i}`);
        vals.push(optionalString(body.description, "description", 4000));
        i += 1;
      }
      if (Object.prototype.hasOwnProperty.call(body, "websiteUrl")) {
        sets.push(`website_url = $${i}`);
        vals.push(optionalWebsiteUrl(body.websiteUrl, "websiteUrl", 2048));
        i += 1;
      }
      if (Object.prototype.hasOwnProperty.call(body, "addressDisplay")) {
        sets.push(`address_display = $${i}`);
        vals.push(optionalString(body.addressDisplay, "addressDisplay", 500));
        i += 1;
      }
      if (Object.prototype.hasOwnProperty.call(body, "category")) {
        sets.push(`category = $${i}`);
        vals.push(optionalString(body.category, "category", 64));
        i += 1;
      }
      if (Object.prototype.hasOwnProperty.call(body, "contactEmail")) {
        sets.push(`contact_email = $${i}`);
        vals.push(optionalString(body.contactEmail, "contactEmail", 254));
        i += 1;
      }
      if (Object.prototype.hasOwnProperty.call(body, "contactPhone")) {
        sets.push(`contact_phone = $${i}`);
        vals.push(optionalString(body.contactPhone, "contactPhone", 32));
        i += 1;
      }
      if (Object.prototype.hasOwnProperty.call(body, "latitude")) {
        const lat = Number(body.latitude);
        if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
          throw httpError(400, "latitude invalid");
        }
        sets.push(`latitude = $${i}`);
        vals.push(lat);
        i += 1;
      }
      if (Object.prototype.hasOwnProperty.call(body, "longitude")) {
        const lng = Number(body.longitude);
        if (!Number.isFinite(lng) || Math.abs(lng) > 180) {
          throw httpError(400, "longitude invalid");
        }
        sets.push(`longitude = $${i}`);
        vals.push(lng);
        i += 1;
      }
      if (Object.prototype.hasOwnProperty.call(body, "visibility")) {
        const v = String(body.visibility || "").trim();
        if (!["draft", "published"].includes(v)) {
          throw httpError(400, "visibility must be draft or published");
        }
        sets.push(`visibility = $${i}`);
        vals.push(v);
        i += 1;
      }

      if (sets.length === 0) {
        throw httpError(400, "No fields to update");
      }
      sets.push("updated_at = NOW()");
      vals.push(id);

      const result = await db.query(
        `UPDATE business_listings SET ${sets.join(", ")} WHERE id = $${i}
         RETURNING id, owner_user_id, name, slug, description, website_url, contact_email, contact_phone,
                   address_display, latitude, longitude, category, visibility, created_at, updated_at`,
        vals
      );
      res.status(200).json(rowToPublic(result.rows[0]));
    })
  );

  return router;
}

module.exports = {
  createBusinessesRouter
};
