const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { authenticate, requireAccessSecret } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { optionalString, optionalWebsiteUrl, requireString } = require("../../utils/validators");
const {
  throwIfUserFacingPolicyViolation,
  throwIfAnyUserFacingPolicyViolation
} = require("../../utils/content-safety");
const { createNotification } = require("../../services/notifications");

function hashInviteToken(plain) {
  return crypto.createHash("sha256").update(String(plain || "").trim(), "utf8").digest("hex");
}

function generateInviteToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function inviteTokenFromQuery(query) {
  const raw = query?.inviteToken;
  const s = typeof raw === "string" ? raw : Array.isArray(raw) && typeof raw[0] === "string" ? raw[0] : "";
  if (!s) {
    return null;
  }
  return optionalString(String(s), "inviteToken", 200);
}

const RSVP_STATUSES = new Set(["interested", "going"]);
const EVENT_VISIBILITY = new Set(["public", "private", "invite"]);
const EVENT_STATUS = new Set(["scheduled", "canceled", "completed"]);

const EVENT_USER_CONTENT_POLICY = {
  termMessage: "Event contains blocked language",
  urlMessage: "Event links to a blocked website"
};

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

async function hasCompletedEventTicketPurchase(db, buyerUserId, eventId) {
  if (!buyerUserId || !eventId) {
    return false;
  }
  const r = await db.query(
    `SELECT 1
     FROM orders o
     JOIN checkout_sessions cs ON cs.id = o.checkout_session_id
     WHERE o.kind = 'event_ticket'
       AND o.buyer_user_id = $1
       AND o.status = 'completed'
       AND (cs.metadata->>'eventId')::int = $2
     LIMIT 1`,
    [buyerUserId, eventId]
  );
  return r.rowCount > 0;
}

function normalizeEventCurrency(value) {
  return String(value || "usd")
    .trim()
    .toLowerCase()
    .slice(0, 3);
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
    admissionPriceMinor: row.admission_price_minor != null ? Number(row.admission_price_minor) : null,
    admissionCurrency: row.admission_currency || null,
    rsvpInterestedCount: Number(row.rsvp_interested_count || 0),
    rsvpGoingCount: Number(row.rsvp_going_count || 0),
    viewerRsvpStatus: row.viewer_rsvp_status || null,
    canJoinChat: Boolean(row.can_join_chat),
    distanceM: row.distance_m != null ? Number(row.distance_m) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function trackAnalyticsEvent({ analytics, eventName, userId, source, surface, platform, properties = {} }) {
  if (!analytics || typeof analytics.trackEvent !== "function") {
    return;
  }
  await analytics.trackEvent(eventName, {
    userId,
    source: source || "unknown",
    surface: surface || "events",
    platform: platform || "unknown",
    ...properties
  });
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

async function loadEventAccess({ db, eventId, viewerId, inviteToken }) {
  const access = await db.query(
    `SELECT e.id, e.host_user_id, e.visibility, e.status, e.starts_at, e.ends_at,
            e.admission_price_minor, e.admission_currency,
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

  let inviteLinkGrantedAccess = false;
  const trimmedToken = inviteToken != null ? String(inviteToken).trim() : "";
  if (trimmedToken) {
    const tokenHash = hashInviteToken(trimmedToken);
    const linkRow = await db.query(
      `SELECT id
       FROM event_invite_links
       WHERE event_id = $1
         AND token_hash = $2
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [eventId, tokenHash]
    );
    inviteLinkGrantedAccess = linkRow.rowCount > 0;
  }

  let hasUserInvite = false;
  if (viewerId && !isHost) {
    const inv = await db.query(
      `SELECT 1
       FROM event_user_invites
       WHERE event_id = $1
         AND invited_user_id = $2
       LIMIT 1`,
      [eventId, viewerId]
    );
    hasUserInvite = inv.rowCount > 0;
  }

  const canViewPublic = row.visibility === "public" && row.status !== "canceled";
  const canViewPrivate =
    isHost || Boolean(viewerRsvpStatus) || hasUserInvite || inviteLinkGrantedAccess;
  if (!canViewPublic && !canViewPrivate) {
    throw httpError(404, "Event not found");
  }
  return {
    row,
    isHost,
    viewerRsvpStatus,
    hasUserInvite,
    inviteLinkGrantedAccess,
    canJoinChat: isHost || viewerRsvpStatus === "going"
  };
}

function isEventChatClosed({ row, graceHours }) {
  if (row.status === "canceled" || row.status === "completed") {
    return true;
  }
  const baseEnd = row.ends_at || row.starts_at;
  const baseTime = new Date(baseEnd).getTime();
  if (!Number.isFinite(baseTime)) {
    return false;
  }
  const graceMs = Math.max(Number(graceHours) || 0, 0) * 60 * 60 * 1000;
  return Date.now() > baseTime + graceMs;
}

function buildEventModerationReason({ eventId, kind, reason }) {
  const cleanReason = String(reason || "").trim();
  const suffix = cleanReason || kind;
  return `[event:${eventId}][kind:${kind}] ${suffix}`.slice(0, 300);
}

async function appendModerationAudit({
  db,
  eventId,
  actorUserId,
  targetUserId = null,
  actionType,
  reason = null,
  note = null
}) {
  await db.query(
    `INSERT INTO event_chat_moderation_actions (
       event_id, actor_user_id, target_user_id, action_type, reason, note
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [eventId, actorUserId, targetUserId, actionType, reason, note]
  );
}

function createEventsRouter({ db, config, analytics, pushNotifications }) {
  const router = express.Router();
  const authMiddleware = authenticate({ db, config });
  let moderationStorageModeCache = null;

  async function getModerationStorageMode() {
    if (moderationStorageModeCache) {
      return moderationStorageModeCache;
    }
    try {
      const check = await db.query(
        `SELECT
           to_regclass('public.event_chat_mutes')::text AS mutes_table,
           to_regclass('public.event_chat_moderation_actions')::text AS actions_table`
      );
      const row = check.rows[0] || {};
      moderationStorageModeCache =
        row.mutes_table && row.actions_table ? "event_chat_tables" : "reports_fallback";
      return moderationStorageModeCache;
    } catch {
      moderationStorageModeCache = "reports_fallback";
      return moderationStorageModeCache;
    }
  }

  async function isUserMutedInEventChat(eventId, userId) {
    const storageMode = await getModerationStorageMode();
    if (storageMode === "event_chat_tables") {
      const muted = await db.query(
        `SELECT 1 FROM event_chat_mutes WHERE event_id = $1 AND user_id = $2 LIMIT 1`,
        [eventId, userId]
      );
      return muted.rowCount > 0;
    }
    const muted = await db.query(
      `SELECT 1
       FROM reports
       WHERE target_type = 'user'
         AND target_id = $1
         AND reason LIKE $2
         AND status IN ('open', 'reviewing')
       LIMIT 1`,
      [String(userId), `[event:${eventId}][kind:mute]%`]
    );
    return muted.rowCount > 0;
  }

  function assertEventsEnabled() {
    if (!config.eventsFeatureEnabled) {
      throw httpError(404, "Events are not enabled");
    }
  }

  function assertReadEnabled() {
    assertEventsEnabled();
    if (!config.eventsReadEnabled) {
      throw httpError(404, "Event discovery is not enabled");
    }
  }

  function assertCreateEnabled() {
    assertEventsEnabled();
    if (!config.eventsCreateEnabled) {
      throw httpError(404, "Event creation is not enabled");
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
      assertReadEnabled();
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
                  e.admission_price_minor,
                  e.admission_currency,
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
      assertReadEnabled();
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
                e.admission_price_minor,
                e.admission_currency,
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
             OR EXISTS (
               SELECT 1
               FROM event_user_invites inv
               WHERE inv.event_id = e.id
                 AND inv.invited_user_id = $1
             )
           )
           AND ($2::int IS NULL OR e.host_user_id = $2)
         ORDER BY e.starts_at ASC, e.id ASC
         LIMIT $3 OFFSET $4`,
        [viewerId || 0, hostUserId, limit, offset]
      );

      await trackAnalyticsEvent({
        analytics,
        eventName: "event_viewed",
        userId: viewerId,
        source: source || "events_list",
        surface: "events_list",
        properties: { action: "list" }
      });

      res.status(200).json({ items: result.rows.map((row) => rowToEvent({ ...row, can_join_chat: row.viewer_rsvp_status === "going" })) });
    })
  );

  router.post(
    "/",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertCreateEnabled();
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
      let admission_price_minor = null;
      let admission_currency = null;
      if (req.body?.admissionPriceMinor != null && req.body.admissionPriceMinor !== "") {
        const p = Number(req.body.admissionPriceMinor);
        if (!Number.isInteger(p) || p < 50) {
          throw httpError(400, "admissionPriceMinor must be at least 50 (cents) for paid events");
        }
        admission_price_minor = p;
        admission_currency = normalizeEventCurrency(req.body?.admissionCurrency || "usd");
      } else if (req.body?.admissionCurrency != null && String(req.body.admissionCurrency).trim() !== "") {
        throw httpError(400, "admissionCurrency cannot be set without admissionPriceMinor");
      }
      const { latitude, longitude } = parseLatLng(req.body?.latitude, req.body?.longitude);

      throwIfAnyUserFacingPolicyViolation(
        [title, description, onlineUrl, addressDisplay],
        config,
        EVENT_USER_CONTENT_POLICY
      );

      const inserted = await db.query(
        `INSERT INTO events (
           host_user_id, title, description, starts_at, ends_at, timezone, is_online, online_url,
           address_display, latitude, longitude, visibility, capacity, status,
           admission_price_minor, admission_currency, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
         RETURNING id, host_user_id, title, description, starts_at, ends_at, timezone, is_online,
                   online_url, address_display, latitude, longitude, visibility, capacity, status,
                   admission_price_minor, admission_currency, created_at, updated_at`,
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
          status,
          admission_price_minor,
          admission_currency
        ]
      );

      await trackAnalyticsEvent({
        analytics,
        eventName: "event_created",
        userId: req.user.id,
        source: optionalString(req.body?.source, "source", 64) || "unknown",
        surface: "events_create",
        properties: { visibility, isOnline }
      });

      res.status(201).json(rowToEvent({ ...inserted.rows[0], can_join_chat: false }));
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertReadEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const viewerId = await getOptionalViewerId({
        db,
        config,
        authorization: req.headers.authorization
      });
      const inviteToken = inviteTokenFromQuery(req.query);
      const access = await loadEventAccess({ db, eventId, viewerId, inviteToken });
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
                e.admission_price_minor,
                e.admission_currency,
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

      await trackAnalyticsEvent({
        analytics,
        eventName: "event_viewed",
        userId: viewerId,
        source: source || "events_detail",
        surface: "events_detail",
        properties: { eventId }
      });

      const base = rowToEvent({
        ...row,
        viewer_rsvp_status: access.viewerRsvpStatus,
        can_join_chat: access.canJoinChat
      });
      let viewerHasTicket = false;
      const adm = row.admission_price_minor != null ? Number(row.admission_price_minor) : 0;
      if (viewerId && adm >= 50) {
        viewerHasTicket = await hasCompletedEventTicketPurchase(db, viewerId, eventId);
      }
      res.status(200).json({
        ...base,
        viewerInvited: Boolean(access.hasUserInvite),
        viewedWithInviteLink: Boolean(access.inviteLinkGrantedAccess),
        viewerHasTicket
      });
    })
  );

  router.patch(
    "/:id",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertCreateEnabled();
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
        const nextTitle = requireString(body.title, "title", 3, 180);
        throwIfUserFacingPolicyViolation(nextTitle, config, EVENT_USER_CONTENT_POLICY);
        sets.push(`title = $${i++}`);
        values.push(nextTitle);
      }
      if (Object.prototype.hasOwnProperty.call(body, "description")) {
        const nextDescription = optionalString(body.description, "description", 4000);
        throwIfUserFacingPolicyViolation(nextDescription, config, EVENT_USER_CONTENT_POLICY);
        sets.push(`description = $${i++}`);
        values.push(nextDescription);
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
        const nextOnlineUrl = optionalWebsiteUrl(body.onlineUrl, "onlineUrl", 2000);
        throwIfUserFacingPolicyViolation(nextOnlineUrl, config, EVENT_USER_CONTENT_POLICY);
        sets.push(`online_url = $${i++}`);
        values.push(nextOnlineUrl);
      }
      if (Object.prototype.hasOwnProperty.call(body, "addressDisplay")) {
        const nextAddress = optionalString(body.addressDisplay, "addressDisplay", 500);
        throwIfUserFacingPolicyViolation(nextAddress, config, EVENT_USER_CONTENT_POLICY);
        sets.push(`address_display = $${i++}`);
        values.push(nextAddress);
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
      if (Object.prototype.hasOwnProperty.call(body, "admissionPriceMinor")) {
        const raw = body.admissionPriceMinor;
        if (raw === null || raw === "") {
          sets.push(`admission_price_minor = $${i++}`);
          values.push(null);
          sets.push(`admission_currency = $${i++}`);
          values.push(null);
        } else {
          const p = Number(raw);
          if (!Number.isInteger(p) || p < 50) {
            throw httpError(400, "admissionPriceMinor must be at least 50 (cents) or null for free events");
          }
          sets.push(`admission_price_minor = $${i++}`);
          values.push(p);
          sets.push(`admission_currency = $${i++}`);
          values.push(normalizeEventCurrency(body.admissionCurrency || "usd"));
        }
      } else if (Object.prototype.hasOwnProperty.call(body, "admissionCurrency")) {
        throw httpError(400, "admissionCurrency cannot be set without admissionPriceMinor");
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
                   admission_price_minor, admission_currency, created_at, updated_at`,
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
      assertCreateEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const status = String(req.body?.status || "").trim().toLowerCase();
      const source = optionalString(req.body?.source, "source", 64);
      const inviteToken = optionalString(req.body?.inviteToken, "inviteToken", 200);
      const access = await loadEventAccess({ db, eventId, viewerId: req.user.id, inviteToken });
      if (access.row.status !== "scheduled") {
        throw httpError(409, "RSVP is not available for this event");
      }

      if (!status || status === "none") {
        await db.query("DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2", [eventId, req.user.id]);
        await trackAnalyticsEvent({
          analytics,
          eventName: "event_rsvp_changed",
          userId: req.user.id,
          source: source || "unknown",
          surface: "events_detail",
          properties: { eventId, status: "none" }
        });
        return res.status(200).json({ eventId, status: null });
      }
      if (!RSVP_STATUSES.has(status)) {
        throw httpError(400, "status must be interested, going, or none");
      }

      if (status === "going") {
        const hostId = access.row.host_user_id;
        const priceMinor =
          access.row.admission_price_minor != null ? Number(access.row.admission_price_minor) : 0;
        if (hostId !== req.user.id && priceMinor >= 50) {
          const paid = await hasCompletedEventTicketPurchase(db, req.user.id, eventId);
          if (!paid) {
            throw httpError(402, "Complete ticket checkout before RSVPing as Going.");
          }
        }
      }

      await db.query(
        `INSERT INTO event_rsvps (event_id, user_id, status, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (event_id, user_id)
         DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
        [eventId, req.user.id, status]
      );

      await trackAnalyticsEvent({
        analytics,
        eventName: "event_rsvp_changed",
        userId: req.user.id,
        source: source || "unknown",
        surface: "events_detail",
        properties: { eventId, status }
      });

      res.status(200).json({ eventId, status });
    })
  );

  router.get(
    "/:id/rsvp/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertReadEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const inviteToken = inviteTokenFromQuery(req.query);
      await loadEventAccess({ db, eventId, viewerId: req.user.id, inviteToken });
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

  router.get(
    "/:id/invite-links",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertReadEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const existing = await db.query(`SELECT host_user_id FROM events WHERE id = $1 LIMIT 1`, [eventId]);
      if (existing.rowCount === 0) {
        throw httpError(404, "Event not found");
      }
      if (existing.rows[0].host_user_id !== req.user.id) {
        throw httpError(403, "Only the host can manage invite links");
      }
      const rows = await db.query(
        `SELECT id, created_at, expires_at, revoked_at
         FROM event_invite_links
         WHERE event_id = $1
         ORDER BY id DESC
         LIMIT 50`,
        [eventId]
      );
      res.status(200).json({
        items: rows.rows.map((r) => ({
          id: r.id,
          createdAt: r.created_at,
          expiresAt: r.expires_at,
          revokedAt: r.revoked_at,
          active: !r.revoked_at && (!r.expires_at || new Date(r.expires_at) > new Date())
        }))
      });
    })
  );

  router.post(
    "/:id/invite-links",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertCreateEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const existing = await db.query(`SELECT host_user_id FROM events WHERE id = $1 LIMIT 1`, [eventId]);
      if (existing.rowCount === 0) {
        throw httpError(404, "Event not found");
      }
      if (existing.rows[0].host_user_id !== req.user.id) {
        throw httpError(403, "Only the host can create invite links");
      }
      let expiresAt = null;
      if (req.body?.expiresInDays != null && req.body.expiresInDays !== "") {
        const days = Number(req.body.expiresInDays);
        if (!Number.isFinite(days) || days < 1 || days > 365) {
          throw httpError(400, "expiresInDays must be between 1 and 365");
        }
        expiresAt = new Date(Date.now() + days * 86400000).toISOString();
      }
      const plain = generateInviteToken();
      const tokenHash = hashInviteToken(plain);
      const ins = await db.query(
        `INSERT INTO event_invite_links (event_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id, created_at, expires_at`,
        [eventId, tokenHash, expiresAt]
      );
      const r = ins.rows[0];
      res.status(201).json({
        id: r.id,
        inviteToken: plain,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        message: "Copy this link token now — it cannot be shown again."
      });
    })
  );

  router.delete(
    "/:id/invite-links/:linkId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      const eventId = Number(req.params.id);
      const linkId = Number(req.params.linkId);
      if (!eventId || !linkId) {
        throw httpError(400, "id and linkId must be numbers");
      }
      const existing = await db.query(`SELECT host_user_id FROM events WHERE id = $1 LIMIT 1`, [eventId]);
      if (existing.rowCount === 0) {
        throw httpError(404, "Event not found");
      }
      if (existing.rows[0].host_user_id !== req.user.id) {
        throw httpError(403, "Only the host can revoke invite links");
      }
      const upd = await db.query(
        `UPDATE event_invite_links
         SET revoked_at = NOW()
         WHERE id = $1 AND event_id = $2 AND revoked_at IS NULL
         RETURNING id`,
        [linkId, eventId]
      );
      if (upd.rowCount === 0) {
        throw httpError(404, "Invite link not found or already revoked");
      }
      res.status(200).json({ revoked: true });
    })
  );

  router.post(
    "/:id/invites/users",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertCreateEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const ev = await db.query(
        `SELECT e.id, e.host_user_id, e.title, p.display_name AS host_display_name
         FROM events e
         JOIN profiles p ON p.user_id = e.host_user_id
         WHERE e.id = $1
         LIMIT 1`,
        [eventId]
      );
      if (ev.rowCount === 0) {
        throw httpError(404, "Event not found");
      }
      const hostUserId = ev.rows[0].host_user_id;
      if (hostUserId !== req.user.id) {
        throw httpError(403, "Only the host can invite members");
      }
      const rawIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
      const userIds = [...new Set(rawIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))].slice(
        0,
        50
      );
      if (userIds.length === 0) {
        throw httpError(400, "userIds must be a non-empty array of user ids");
      }
      const title = String(ev.rows[0].title || "An event");
      const hostName = String(ev.rows[0].host_display_name || "Host").trim() || "Host";
      let invited = 0;
      for (const uid of userIds) {
        if (uid === hostUserId) {
          continue;
        }
        const ucheck = await db.query(`SELECT id FROM users WHERE id = $1 AND is_active = true LIMIT 1`, [uid]);
        if (ucheck.rowCount === 0) {
          continue;
        }
        const ins = await db.query(
          `INSERT INTO event_user_invites (event_id, invited_user_id, invited_by_user_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (event_id, invited_user_id) DO NOTHING
           RETURNING event_id`,
          [eventId, uid, req.user.id]
        );
        if (ins.rowCount > 0) {
          invited += 1;
          await createNotification(
            db,
            uid,
            "event_invited",
            {
              eventId,
              title,
              hostUserId,
              hostDisplayName: hostName
            },
            { pushNotifications }
          );
        }
      }
      res.status(200).json({ invited, requested: userIds.length });
    })
  );

  router.get(
    "/:id/attendees",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertReadEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const existing = await db.query(`SELECT host_user_id FROM events WHERE id = $1 LIMIT 1`, [eventId]);
      if (existing.rowCount === 0) {
        throw httpError(404, "Event not found");
      }
      if (existing.rows[0].host_user_id !== req.user.id) {
        throw httpError(403, "Only the host can view the guest list");
      }
      const rsvps = await db.query(
        `SELECT r.user_id, r.status, r.updated_at, p.display_name
         FROM event_rsvps r
         JOIN profiles p ON p.user_id = r.user_id
         WHERE r.event_id = $1
         ORDER BY r.status ASC, p.display_name ASC NULLS LAST, r.user_id ASC`,
        [eventId]
      );
      const pending = await db.query(
        `SELECT i.invited_user_id, i.created_at, p.display_name
         FROM event_user_invites i
         JOIN profiles p ON p.user_id = i.invited_user_id
         WHERE i.event_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM event_rsvps r WHERE r.event_id = i.event_id AND r.user_id = i.invited_user_id
           )
         ORDER BY i.created_at DESC`,
        [eventId]
      );
      res.status(200).json({
        rsvps: rsvps.rows.map((r) => ({
          userId: r.user_id,
          displayName: r.display_name,
          status: r.status,
          updatedAt: r.updated_at
        })),
        pendingInvites: pending.rows.map((r) => ({
          userId: r.invited_user_id,
          displayName: r.display_name,
          invitedAt: r.created_at
        }))
      });
    })
  );

  router.delete(
    "/:id/rsvps/:userId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertCreateEnabled();
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
      const reason = optionalString(req.body?.reason, "reason", 300);
      const storageMode = await getModerationStorageMode();
      if (storageMode === "event_chat_tables") {
        await appendModerationAudit({
          db,
          eventId,
          actorUserId: req.user.id,
          targetUserId,
          actionType: "remove_attendee",
          reason
        });
      } else {
        await db.query(
          `INSERT INTO reports (reporter_user_id, target_type, target_id, reason, status)
           VALUES ($1, 'user', $2, $3, 'open')`,
          [
            req.user.id,
            String(targetUserId),
            buildEventModerationReason({ eventId, kind: "remove_attendee", reason })
          ]
        );
      }
      res.status(200).json({ removed: true });
    })
  );

  router.post(
    "/:id/chat/mute",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertCreateEnabled();
      const eventId = Number(req.params.id);
      const targetUserId = Number(req.body?.userId);
      if (!eventId || !targetUserId) {
        throw httpError(400, "id and userId must be numbers");
      }
      const event = await db.query("SELECT host_user_id FROM events WHERE id = $1 LIMIT 1", [eventId]);
      if (event.rowCount === 0) {
        throw httpError(404, "Event not found");
      }
      if (event.rows[0].host_user_id !== req.user.id) {
        throw httpError(403, "Only event host can mute attendees");
      }
      const reason = optionalString(req.body?.reason, "reason", 300);
      const storageMode = await getModerationStorageMode();
      if (storageMode === "event_chat_tables") {
        await db.query(
          `INSERT INTO event_chat_mutes (event_id, user_id, muted_by_user_id, reason)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (event_id, user_id)
           DO UPDATE SET muted_by_user_id = EXCLUDED.muted_by_user_id, reason = EXCLUDED.reason`,
          [eventId, targetUserId, req.user.id, reason]
        );
        await appendModerationAudit({
          db,
          eventId,
          actorUserId: req.user.id,
          targetUserId,
          actionType: "mute",
          reason
        });
      } else {
        await db.query(
          `INSERT INTO reports (reporter_user_id, target_type, target_id, reason, status)
           VALUES ($1, 'user', $2, $3, 'open')
           ON CONFLICT DO NOTHING`,
          [
            req.user.id,
            String(targetUserId),
            buildEventModerationReason({ eventId, kind: "mute", reason: reason || "muted by host" })
          ]
        );
      }
      res.status(200).json({ muted: true });
    })
  );

  router.delete(
    "/:id/chat/mute/:userId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertCreateEnabled();
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
        throw httpError(403, "Only event host can unmute attendees");
      }
      const storageMode = await getModerationStorageMode();
      if (storageMode === "event_chat_tables") {
        await db.query("DELETE FROM event_chat_mutes WHERE event_id = $1 AND user_id = $2", [eventId, targetUserId]);
        await appendModerationAudit({
          db,
          eventId,
          actorUserId: req.user.id,
          targetUserId,
          actionType: "unmute"
        });
      } else {
        await db.query(
          `UPDATE reports
           SET status = 'resolved'
           WHERE target_type = 'user'
             AND target_id = $1
             AND reason LIKE $2
             AND status IN ('open', 'reviewing')`,
          [String(targetUserId), `[event:${eventId}][kind:mute]%`]
        );
      }
      res.status(200).json({ muted: false });
    })
  );

  router.post(
    "/:id/chat/report",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertReadEnabled();
      const eventId = Number(req.params.id);
      const targetUserId = Number(req.body?.userId);
      if (!eventId || !targetUserId) {
        throw httpError(400, "id and userId must be numbers");
      }
      const reason = requireString(req.body?.reason, "reason", 3, 300);
      const note = optionalString(req.body?.note, "note", 2000);
      const storageMode = await getModerationStorageMode();
      if (storageMode === "event_chat_tables") {
        await appendModerationAudit({
          db,
          eventId,
          actorUserId: req.user.id,
          targetUserId,
          actionType: "report",
          reason,
          note
        });
      }
      await db.query(
        `INSERT INTO reports (reporter_user_id, target_type, target_id, reason, status)
         VALUES ($1, 'user', $2, $3, 'open')`,
        [
          req.user.id,
          String(targetUserId),
          buildEventModerationReason({ eventId, kind: "report", reason })
        ]
      );
      res.status(201).json({ reported: true });
    })
  );

  router.get(
    "/:id/chat/moderation",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertReadEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const event = await db.query("SELECT host_user_id FROM events WHERE id = $1 LIMIT 1", [eventId]);
      if (event.rowCount === 0) {
        throw httpError(404, "Event not found");
      }
      if (event.rows[0].host_user_id !== req.user.id) {
        throw httpError(403, "Only event host can view moderation logs");
      }
      const storageMode = await getModerationStorageMode();
      if (storageMode === "event_chat_tables") {
        const [mutes, actions] = await Promise.all([
          db.query(
            `SELECT m.event_id, m.user_id, m.muted_by_user_id, m.reason, m.created_at,
                    p.display_name AS user_display_name
             FROM event_chat_mutes m
             LEFT JOIN profiles p ON p.user_id = m.user_id
             WHERE m.event_id = $1
             ORDER BY m.created_at DESC`,
            [eventId]
          ),
          db.query(
            `SELECT a.id, a.event_id, a.actor_user_id, a.target_user_id, a.action_type, a.reason, a.note, a.created_at,
                    ap.display_name AS actor_display_name,
                    tp.display_name AS target_display_name
             FROM event_chat_moderation_actions a
             LEFT JOIN profiles ap ON ap.user_id = a.actor_user_id
             LEFT JOIN profiles tp ON tp.user_id = a.target_user_id
             WHERE a.event_id = $1
             ORDER BY a.created_at DESC
             LIMIT 100`,
            [eventId]
          )
        ]);
        return res.status(200).json({ mutes: mutes.rows, actions: actions.rows });
      }
      const fallback = await db.query(
        `SELECT id, target_type, target_id, reason, created_at
         FROM reports
         WHERE reporter_user_id = $1
           AND target_type = 'user'
           AND reason LIKE $2
         ORDER BY created_at DESC
         LIMIT 100`,
        [req.user.id, `[event:${eventId}][kind:%`]
      );
      const mutes = fallback.rows
        .filter((row) => String(row.reason || "").startsWith(`[event:${eventId}][kind:mute]`))
        .map((row) => ({
          event_id: eventId,
          user_id: Number(row.target_id),
          muted_by_user_id: req.user.id,
          reason: row.reason,
          created_at: row.created_at
        }));
      const actions = fallback.rows.map((row) => ({
        id: row.id,
        event_id: eventId,
        action_type: String(row.reason || "").includes("[kind:remove_attendee]")
          ? "remove_attendee"
          : String(row.reason || "").includes("[kind:report]")
            ? "report"
            : "mute",
        reason: row.reason,
        created_at: row.created_at
      }));
      return res.status(200).json({ mutes, actions });
    })
  );

  router.get(
    "/:id/chat",
    authMiddleware,
    asyncHandler(async (req, res) => {
      assertEventsEnabled();
      assertReadEnabled();
      assertChatEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const inviteToken = inviteTokenFromQuery(req.query);
      const access = await loadEventAccess({ db, eventId, viewerId: req.user.id, inviteToken });
      if (!access.canJoinChat) {
        throw httpError(403, "Join this event (Going) to access chat");
      }
      if (await isUserMutedInEventChat(eventId, req.user.id)) {
        throw httpError(403, "You are muted in this event chat");
      }
      if (isEventChatClosed({ row: access.row, graceHours: config.eventsChatGraceHours })) {
        throw httpError(409, "Event chat has closed for this event");
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

      await trackAnalyticsEvent({
        analytics,
        eventName: "event_chat_joined",
        userId: req.user.id,
        source: "events_chat",
        surface: "events_chat",
        properties: { eventId }
      });

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
      assertCreateEnabled();
      assertChatEnabled();
      const eventId = Number(req.params.id);
      if (!eventId) {
        throw httpError(400, "id must be a number");
      }
      const inviteToken = optionalString(req.body?.inviteToken, "inviteToken", 200);
      const access = await loadEventAccess({ db, eventId, viewerId: req.user.id, inviteToken });
      if (!access.canJoinChat) {
        throw httpError(403, "Join this event (Going) to send messages");
      }
      if (await isUserMutedInEventChat(eventId, req.user.id)) {
        throw httpError(403, "You are muted in this event chat");
      }
      if (isEventChatClosed({ row: access.row, graceHours: config.eventsChatGraceHours })) {
        throw httpError(409, "Event chat has closed for this event");
      }
      const body = requireString(req.body?.body, "body", 1, 4000);
      throwIfUserFacingPolicyViolation(body, config, {
        termMessage: "Message contains blocked language",
        urlMessage: "Message links to a blocked website"
      });
      const inserted = await db.query(
        `INSERT INTO event_chat_messages (event_id, sender_user_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, event_id, sender_user_id, body, created_at`,
        [eventId, req.user.id, body]
      );
      await trackAnalyticsEvent({
        analytics,
        eventName: "event_chat_message_sent",
        userId: req.user.id,
        source: optionalString(req.body?.source, "source", 64) || "unknown",
        surface: "events_chat",
        properties: { eventId }
      });
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
