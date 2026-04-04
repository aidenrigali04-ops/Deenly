const express = require("express");
const jwt = require("jsonwebtoken");
const { authenticate, requireAccessSecret } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { optionalString, optionalWebsiteUrl, requireString } = require("../../utils/validators");

const RSVP_STATUSES = new Set(["interested", "going"]);
const EVENT_VISIBILITY = new Set(["public", "private", "invite"]);
const EVENT_STATUS = new Set(["scheduled", "canceled", "completed"]);

function parseIsoDate(input, fieldName) {
  const raw = String(input || "").trim();
  if (!raw) {
    throw httpError(400, `${fieldName} is required`);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, `${fieldName} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function parseOptionalIsoDate(input, fieldName) {
  if (input === null || input === undefined || input === "") {
    return null;
  }
  const date = new Date(String(input));
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, `${fieldName} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function parseLatLng(latRaw, lngRaw) {
  if (
    (latRaw === undefined || latRaw === null || latRaw === "") &&
    (lngRaw === undefined || lngRaw === null || lngRaw === "")
  ) {
    return { latitude: null, longitude: null };
  }
  const latitude = Number(latRaw);
  const longitude = Number(lngRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw httpError(400, "latitude and longitude must both be valid numbers");
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw httpError(400, "latitude/longitude out of range");
  }
  return { latitude, longitude };
}

function rowToEvent(row) {
  return {
    id: row.id,
    hostUserId: row.host_user_id,
    hostDisplayName: row.host_display_name || null,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    isOnline: row.is_online,
    onlineUrl: row.online_url,
    addressDisplay: row.address_display,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    visibility: row.visibility,
    capacity: row.capacity != null ? Number(row.capacity) : null,
    status: row.status,
    rsvpInterestedCount: Number(row.rsvp_interested_count || 0),
    rsvpGoingCount: Number(row.rsvp_going_count || 0),
    viewerRsvpStatus: row.viewer_rsvp_status || null,
    canJoinChat: Boolean(row.can_join_chat),
    distanceM: row.distance_m != null ? Number(row.distance_m) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getOptionalViewerId({ db, config, authorization }) {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return null;
  }
  try {
    const token = authorization.slice("Bearer ".length);
    const payload = jwt.verify(token, requireAccessSecret(config));
    const userId = Number(payload?.sub);
    if (!userId) {
      return null;
    }
    const result = await db.query("SELECT id FROM users WHERE id = $1 AND is_active = true LIMIT 1", [userId]);
    if (result.rowCount === 0) {
      return null;
    }
    return userId;
  } catch {
    return null;
  }
}

async function loadEventAccess({ db, eventId, viewerId }) {
  const access = await db.query(
    `SELECT e.id, e.host_user_id, e.visibility, e.status,
            (
              SELECT r.status
              FROM event_rsvps r
              WHERE r.event_id = e.id
                AND r.user_id = $2
              LIMIT 1
            ) AS viewer_rsvp_status
     FROM events e
     WHERE e.id = $1
     LIMIT 1`,
    [eventId, viewerId || 0]
  );
  if (access.rowCount === 0) {
    throw httpError(404, "Event not found");
  }
  const row = access.rows[0];
  const isHost = Boolean(viewerId && row.host_user_id === viewerId);
  const viewerRsvpStatus = row.viewer_rsvp_status || null;
  const canViewPublic = row.visibility === "public" && row.status !== "canceled";
  const canViewPrivate = isHost || Boolean(viewerRsvpStatus);
  if (!canViewPublic && !canViewPrivate) {
    throw httpError(404, "Event not found");
  }
  return {
    row,
    isHost,
    viewerRsvpStatus,
    canJoinChat: isHost || viewerRsvpStatus === "going"
  };
}

function createEventsRouter({ db, config, analytics }) {
  const router = express.Router();
  const authMiddleware = authenticate({ db, config });

  function assertEventsEnabled() {
    if (!config.eventsFeatureEnabled) {
      throw httpError(404, "Events are not enabled");
    }
  }

  function assertChatEnabled() {
    if (!config.eventsChatEnabled) {
      throw httpError(404, "Event chat is not enabled");
    }
  }

  router.get(
    "/near",
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      const viewerId = await getOptionalViewerId({
        db,
        config,
        authorization: req.headers.authorization
      });
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw httpError(400, "lat and lng must be numbers");
      }
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw httpError(400, "lat/lng out of range");
      }
      const radiusM = Math.min(Math.max(Number(req.query.radiusM) || 25_000, 100), 100_000);
      const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
      const timeWindow = String(req.query.timeWindow || "upcoming").trim().toLowerCase();
      if (!["upcoming", "today", "this_week"].includes(timeWindow)) {
        throw httpError(400, "timeWindow must be upcoming, today, or this_week");
      }

      const result = await db.query(
        `WITH event_base AS (
           SELECT e.id,
                  e.host_user_id,
                  e.title,
                  e.description,
                  e.starts_at,
                  e.ends_at,
                  e.timezone,
                  e.is_online,
                  e.online_url,
                  e.address_display,
                  e.latitude,
                  e.longitude,
                  e.visibility,
                  e.capacity,
                  e.status,
                  e.created_at,
                  e.updated_at,
                  p.display_name AS host_display_name,
                  (
                    SELECT r.status
                    FROM event_rsvps r
                    WHERE r.event_id = e.id
                      AND r.user_id = $5
                    LIMIT 1
                  ) AS viewer_rsvp_status,
                  (
                    SELECT COUNT(*)::int
                    FROM event_rsvps r
                    WHERE r.event_id = e.id
                      AND r.status = 'interested'
                  ) AS rsvp_interested_count,
                  (
                    SELECT COUNT(*)::int
                    FROM event_rsvps r
                    WHERE r.event_id = e.id
                      AND r.status = 'going'
                  ) AS rsvp_going_count,
                  (
                    6371000 * acos(
                      LEAST(1.0, GREATEST(-1.0,
                        cos(radians($1::float8)) * cos(radians(e.latitude)) * cos(radians(e.longitude) - radians($2::float8))
                        + sin(radians($1::float8)) * sin(radians(e.latitude))
                      ))
                    )
                  )::float8 AS distance_m
           FROM events e
           JOIN profiles p ON p.user_id = e.host_user_id
           WHERE e.status = 'scheduled'
             AND e.visibility = 'public'
             AND e.latitude IS NOT NULL
             AND e.longitude IS NOT NULL
         )
         SELECT *
         FROM event_base
         WHERE distance_m <= $3::float8
           AND (
             ($4::text = 'upcoming' AND starts_at >= NOW())
             OR ($4::text = 'today' AND starts_at >= date_trunc('day', NOW()) AND starts_at < date_trunc('day', NOW()) + interval '1 day')
             OR ($4::text = 'this_week' AND starts_at >= date_trunc('day', NOW()) AND starts_at < date_trunc('day', NOW()) + interval '7 day')
           )
         ORDER BY starts_at ASC, id ASC
         LIMIT $6`,
        [lat, lng, radiusM, timeWindow, viewerId || 0, limit]
      );

      res.status(200).json({
        items: result.rows.map((row) => rowToEvent({ ...row, can_join_chat: row.viewer_rsvp_status === "going" }))
      });
    })
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      const viewerId = await getOptionalViewerId({
        db,
        config,
        authorization: req.headers.authorization
      });
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const hostUserId = req.query.hostUserId ? Number(req.query.hostUserId) : null;
      if (req.query.hostUserId && !hostUserId) {
        throw httpError(400, "hostUserId must be a number");
      }
      const source = optionalString(req.query.source, "source", 64);

      const result = await db.query(
        `SELECT e.id,
                e.host_user_id,
                e.title,
                e.description,
                e.starts_at,
                e.ends_at,
                e.timezone,
                e.is_online,
                e.online_url,
                e.address_display,
                e.latitude,
                e.longitude,
                e.visibility,
                e.capacity,
                e.status,
                e.created_at,
                e.updated_at,
                p.display_name AS host_display_name,
                (
                  SELECT r.status
                  FROM event_rsvps r
                  WHERE r.event_id = e.id
                    AND r.user_id = $1
                  LIMIT 1
                ) AS viewer_rsvp_status,
                (
                  SELECT COUNT(*)::int
                  FROM event_rsvps r
                  WHERE r.event_id = e.id
                    AND r.status = 'interested'
                ) AS rsvp_interested_count,
                (
                  SELECT COUNT(*)::int
                  FROM event_rsvps r
                  WHERE r.event_id = e.id
                    AND r.status = 'going'
                ) AS rsvp_going_count
         FROM events e
         JOIN profiles p ON p.user_id = e.host_user_id
         WHERE (
             e.visibility = 'public'
             OR e.host_user_id = $1
             OR EXISTS (
               SELECT 1
               FROM event_rsvps my
               WHERE my.event_id = e.id
                 AND my.user_id = $1
             )
           )
           AND ($2::int IS NULL OR e.host_user_id = $2)
         ORDER BY e.starts_at ASC, e.id ASC
         LIMIT $3 OFFSET $4`,
        [viewerId || 0, hostUserId, limit, offset]
      );

      if (analytics && typeof analytics.trackEvent === "function") {
        analytics.trackEvent({
          userId: viewerId,
          eventName: "event_viewed",
          properties: { source: source || "events_list", action: "list" }
        });
      }

      res.status(200).json({ items: result.rows.map((row) => rowToEvent({ ...row, can_join_chat: row.viewer_rsvp_status === "going" })) });
    })
  );

  router.post(
    "/",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      const title = requireString(req.body?.title, "title", 3, 180);
      const description = optionalString(req.body?.description, "description", 4000);
      const startsAt = parseIsoDate(req.body?.startsAt, "startsAt");
      const endsAt = parseOptionalIsoDate(req.body?.endsAt, "endsAt");
      if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
        throw httpError(400, "endsAt must be after startsAt");
      }
      const timezone = optionalString(req.body?.timezone, "timezone", 64);
      const isOnline = Boolean(req.body?.isOnline);
      const onlineUrl = optionalWebsiteUrl(req.body?.onlineUrl, "onlineUrl", 2000);
      const addressDisplay = optionalString(req.body?.addressDisplay, "addressDisplay", 500);
      const visibility = String(req.body?.visibility || "public").trim().toLowerCase();
      if (!EVENT_VISIBILITY.has(visibility)) {
        throw httpError(400, "visibility must be public, private, or invite");
      }
      const status = String(req.body?.status || "scheduled").trim().toLowerCase();
      if (!EVENT_STATUS.has(status)) {
        throw httpError(400, "status must be scheduled, canceled, or completed");
      }
      const capacity = req.body?.capacity == null ? null : Number(req.body.capacity);
      if (capacity != null && (!Number.isInteger(capacity) || capacity <= 0)) {
        throw httpError(400, "capacity must be a positive integer");
      }
      const { latitude, longitude } = parseLatLng(req.body?.latitude, req.body?.longitude);

      const inserted = await db.query(
        `INSERT INTO events (
           host_user_id, title, description, starts_at, ends_at, timezone, is_online, online_url,
           address_display, latitude, longitude, visibility, capacity, status, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
         RETURNING id, host_user_id, title, description, starts_at, ends_at, timezone, is_online,
                   online_url, address_display, latitude, longitude, visibility, capacity, status,
                   created_at, updated_at`,
        [
          req.user.id,
          title,
          description,
          startsAt,
          endsAt,
          timezone,
          isOnline,
          onlineUrl,
          addressDisplay,
          latitude,
          longitude,
          visibility,
          capacity,
          status
        ]
      );

      if (analytics && typeof analytics.trackEvent === "function") {
        analytics.trackEvent({
          userId: req.user.id,
          eventName: "event_created",
          properties: {
            source: optionalString(req.body?.source, "source", 64) || "unknown",
            visibility,
            isOnline
          }
        });
      }

      res.status(201).json(rowToEvent({ ...inserted.rows[0], can_join_chat: false }));
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const viewerId = await getOptionalViewerId({
        db,
        config,
        authorization: req.headers.authorization
      });
      const access = await loadEventAccess({ db, eventId, viewerId });
      const source = optionalString(req.query.source, "source", 64);

      const result = await db.query(
        `SELECT e.id,
                e.host_user_id,
                e.title,
                e.description,
                e.starts_at,
                e.ends_at,
                e.timezone,
                e.is_online,
                e.online_url,
                e.address_display,
                e.latitude,
                e.longitude,
                e.visibility,
                e.capacity,
                e.status,
                e.created_at,
                e.updated_at,
                p.display_name AS host_display_name,
                (
                  SELECT COUNT(*)::int
                  FROM event_rsvps r
                  WHERE r.event_id = e.id
                    AND r.status = 'interested'
                ) AS rsvp_interested_count,
                (
                  SELECT COUNT(*)::int
                  FROM event_rsvps r
                  WHERE r.event_id = e.id
                    AND r.status = 'going'
                ) AS rsvp_going_count
         FROM events e
         JOIN profiles p ON p.user_id = e.host_user_id
         WHERE e.id = $1
         LIMIT 1`,
        [eventId]
      );
      const row = result.rows[0];

      if (analytics && typeof analytics.trackEvent === "function") {
        analytics.trackEvent({
          userId: viewerId,
          eventName: "event_viewed",
          properties: { source: source || "events_detail", eventId }
        });
      }

      res.status(200).json(
        rowToEvent({
          ...row,
          viewer_rsvp_status: access.viewerRsvpStatus,
          can_join_chat: access.canJoinChat
        })
      );
    })
  );

  router.patch(
    "/:id",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const existing = await db.query(`SELECT id, host_user_id FROM events WHERE id = $1 LIMIT 1`, [eventId]);
      if (existing.rowCount === 0) {
        throw httpError(404, "Event not found");
      }
      if (existing.rows[0].host_user_id !== req.user.id) {
        throw httpError(403, "Not allowed to update this event");
      }
      const body = req.body || {};
      const sets = [];
      const values = [];
      let i = 1;

      if (Object.prototype.hasOwnProperty.call(body, "title")) {
        sets.push(`title = $${i++}`);
        values.push(requireString(body.title, "title", 3, 180));
      }
      if (Object.prototype.hasOwnProperty.call(body, "description")) {
        sets.push(`description = $${i++}`);
        values.push(optionalString(body.description, "description", 4000));
      }
      if (Object.prototype.hasOwnProperty.call(body, "startsAt")) {
        sets.push(`starts_at = $${i++}`);
        values.push(parseIsoDate(body.startsAt, "startsAt"));
      }
      if (Object.prototype.hasOwnProperty.call(body, "endsAt")) {
        sets.push(`ends_at = $${i++}`);
        values.push(parseOptionalIsoDate(body.endsAt, "endsAt"));
      }
      if (Object.prototype.hasOwnProperty.call(body, "timezone")) {
        sets.push(`timezone = $${i++}`);
        values.push(optionalString(body.timezone, "timezone", 64));
      }
      if (Object.prototype.hasOwnProperty.call(body, "isOnline")) {
        sets.push(`is_online = $${i++}`);
        values.push(Boolean(body.isOnline));
      }
      if (Object.prototype.hasOwnProperty.call(body, "onlineUrl")) {
        sets.push(`online_url = $${i++}`);
        values.push(optionalWebsiteUrl(body.onlineUrl, "onlineUrl", 2000));
      }
      if (Object.prototype.hasOwnProperty.call(body, "addressDisplay")) {
        sets.push(`address_display = $${i++}`);
        values.push(optionalString(body.addressDisplay, "addressDisplay", 500));
      }
      if (
        Object.prototype.hasOwnProperty.call(body, "latitude") ||
        Object.prototype.hasOwnProperty.call(body, "longitude")
      ) {
        const { latitude, longitude } = parseLatLng(body.latitude, body.longitude);
        sets.push(`latitude = $${i++}`);
        values.push(latitude);
        sets.push(`longitude = $${i++}`);
        values.push(longitude);
      }
      if (Object.prototype.hasOwnProperty.call(body, "visibility")) {
        const visibility = String(body.visibility || "").trim().toLowerCase();
        if (!EVENT_VISIBILITY.has(visibility)) {
          throw httpError(400, "visibility must be public, private, or invite");
        }
        sets.push(`visibility = $${i++}`);
        values.push(visibility);
      }
      if (Object.prototype.hasOwnProperty.call(body, "capacity")) {
        const capacity = body.capacity == null ? null : Number(body.capacity);
        if (capacity != null && (!Number.isInteger(capacity) || capacity <= 0)) {
          throw httpError(400, "capacity must be a positive integer");
        }
        sets.push(`capacity = $${i++}`);
        values.push(capacity);
      }
      if (Object.prototype.hasOwnProperty.call(body, "status")) {
        const status = String(body.status || "").trim().toLowerCase();
        if (!EVENT_STATUS.has(status)) {
          throw httpError(400, "status must be scheduled, canceled, or completed");
        }
        sets.push(`status = $${i++}`);
        values.push(status);
      }

      if (sets.length === 0) {
        throw httpError(400, "No fields to update");
      }

      sets.push("updated_at = NOW()");
      values.push(eventId);
      const result = await db.query(
        `UPDATE events
         SET ${sets.join(", ")}
         WHERE id = $${i}
         RETURNING id, host_user_id, title, description, starts_at, ends_at, timezone, is_online,
                   online_url, address_display, latitude, longitude, visibility, capacity, status,
                   created_at, updated_at`,
        values
      );
      res.status(200).json(rowToEvent({ ...result.rows[0], can_join_chat: false }));
    })
  );

  router.post(
    "/:id/rsvp",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const status = String(req.body?.status || "").trim().toLowerCase();
      const source = optionalString(req.body?.source, "source", 64);
      const access = await loadEventAccess({ db, eventId, viewerId: req.user.id });
      if (access.row.status !== "scheduled") {
        throw httpError(409, "RSVP is not available for this event");
      }

      if (!status || status === "none") {
        await db.query("DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2", [eventId, req.user.id]);
        if (analytics && typeof analytics.trackEvent === "function") {
          analytics.trackEvent({
            userId: req.user.id,
            eventName: "event_rsvp_changed",
            properties: { eventId, status: "none", source: source || "unknown" }
          });
        }
        return res.status(200).json({ eventId, status: null });
      }
      if (!RSVP_STATUSES.has(status)) {
        throw httpError(400, "status must be interested, going, or none");
      }

      await db.query(
        `INSERT INTO event_rsvps (event_id, user_id, status, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (event_id, user_id)
         DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
        [eventId, req.user.id, status]
      );

      if (analytics && typeof analytics.trackEvent === "function") {
        analytics.trackEvent({
          userId: req.user.id,
          eventName: "event_rsvp_changed",
          properties: { eventId, status, source: source || "unknown" }
        });
      }

      res.status(200).json({ eventId, status });
    })
  );

  router.get(
    "/:id/rsvp/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      await loadEventAccess({ db, eventId, viewerId: req.user.id });
      const result = await db.query(
        `SELECT status
         FROM event_rsvps
         WHERE event_id = $1
           AND user_id = $2
         LIMIT 1`,
        [eventId, req.user.id]
      );
      res.status(200).json({
        eventId,
        status: result.rows[0]?.status || null
      });
    })
  );

  router.delete(
    "/:id/rsvps/:userId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      const eventId = Number(req.params.id);
      const targetUserId = Number(req.params.userId);
      if (!eventId || !targetUserId) {
        throw httpError(400, "id and userId must be numbers");
      }
      const event = await db.query("SELECT host_user_id FROM events WHERE id = $1 LIMIT 1", [eventId]);
      if (event.rowCount === 0) {
        throw httpError(404, "Event not found");
      }
      if (event.rows[0].host_user_id !== req.user.id) {
        throw httpError(403, "Not allowed to modify attendees for this event");
      }
      await db.query("DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2", [eventId, targetUserId]);
      res.status(200).json({ removed: true });
    })
  );

  router.get(
    "/:id/chat",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertChatEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const access = await loadEventAccess({ db, eventId, viewerId: req.user.id });
      if (!access.canJoinChat) {
        throw httpError(403, "Join this event (Going) to access chat");
      }
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const beforeId = req.query.beforeId ? Number(req.query.beforeId) : null;

      const result = await db.query(
        `SELECT m.id, m.event_id, m.sender_user_id, m.body, m.created_at, p.display_name AS sender_display_name
         FROM event_chat_messages m
         JOIN profiles p ON p.user_id = m.sender_user_id
         WHERE m.event_id = $1
           AND ($2::int IS NULL OR m.id < $2)
         ORDER BY m.id DESC
         LIMIT $3`,
        [eventId, beforeId, limit]
      );

      if (analytics && typeof analytics.trackEvent === "function") {
        analytics.trackEvent({
          userId: req.user.id,
          eventName: "event_chat_joined",
          properties: { eventId }
        });
      }

      res.status(200).json({
        items: result.rows.reverse().map((row) => ({
          id: row.id,
          eventId: row.event_id,
          senderUserId: row.sender_user_id,
          senderDisplayName: row.sender_display_name,
          body: row.body,
          createdAt: row.created_at
        }))
      });
    })
  );

  router.post(
    "/:id/chat",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertChatEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const access = await loadEventAccess({ db, eventId, viewerId: req.user.id });
      if (!access.canJoinChat) {
        throw httpError(403, "Join this event (Going) to send messages");
      }
      const body = requireString(req.body?.body, "body", 1, 4000);
      const blockedTerms = Array.isArray(config.commentBlockedTerms) ? config.commentBlockedTerms : [];
      const normalizedBody = body.toLowerCase();
      const blocked = blockedTerms.find((term) => term && normalizedBody.includes(String(term).toLowerCase()));
      if (blocked) {
        throw httpError(400, "Message contains blocked language");
      }
      const inserted = await db.query(
        `INSERT INTO event_chat_messages (event_id, sender_user_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, event_id, sender_user_id, body, created_at`,
        [eventId, req.user.id, body]
      );
      if (analytics && typeof analytics.trackEvent === "function") {
        analytics.trackEvent({
          userId: req.user.id,
          eventName: "event_chat_message_sent",
          properties: {
            eventId,
            source: optionalString(req.body?.source, "source", 64) || "unknown"
          }
        });
      }
      res.status(201).json({
        id: inserted.rows[0].id,
        eventId: inserted.rows[0].event_id,
        senderUserId: inserted.rows[0].sender_user_id,
        body: inserted.rows[0].body,
        createdAt: inserted.rows[0].created_at
      });
    })
  );

  return router;
}

module.exports = {
  createEventsRouter
};
