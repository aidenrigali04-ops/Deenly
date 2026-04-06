const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { requireString } = require("../../utils/validators");

function createMessagesRouter({ db, config, pushNotifications = null }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  function hasBlockedTerm(text) {
    const blockedTerms = config.commentBlockedTerms || [];
    if (!text || blockedTerms.length === 0) {
      return false;
    }
    const normalized = String(text).toLowerCase();
    return blockedTerms.some((term) => normalized.includes(String(term || "").toLowerCase()));
  }

  async function ensureNoSafetyBlockBetween(userA, userB) {
    const blocked = await db.query(
      `SELECT 1
       FROM user_blocks ub
       WHERE (ub.user_id = $1 AND ub.blocked_user_id = $2)
          OR (ub.user_id = $2 AND ub.blocked_user_id = $1)
       LIMIT 1`,
      [userA, userB]
    );
    if (blocked.rowCount > 0) {
      throw httpError(403, "Messaging unavailable due to safety settings");
    }
  }

  async function ensureParticipant(conversationId, userId) {
    const participant = await db.query(
      `SELECT id
       FROM conversation_participants
       WHERE conversation_id = $1
         AND user_id = $2
       LIMIT 1`,
      [conversationId, userId]
    );
    if (participant.rowCount === 0) {
      throw httpError(403, "Not a conversation participant");
    }
  }

  router.post(
    "/conversations",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const participantUserId = Number(req.body?.participantUserId);
      if (!participantUserId) {
        throw httpError(400, "participantUserId must be a number");
      }
      if (participantUserId === req.user.id) {
        throw httpError(400, "Cannot create conversation with yourself");
      }
      await ensureNoSafetyBlockBetween(req.user.id, participantUserId);

      const existing = await db.query(
        `SELECT cp1.conversation_id
         FROM conversation_participants cp1
         JOIN conversation_participants cp2
           ON cp2.conversation_id = cp1.conversation_id
         WHERE cp1.user_id = $1
           AND cp2.user_id = $2
         LIMIT 1`,
        [req.user.id, participantUserId]
      );

      if (existing.rowCount > 0) {
        return res.status(200).json({ conversationId: existing.rows[0].conversation_id });
      }

      const createdConversation = await db.query(
        `INSERT INTO conversations (created_by)
         VALUES ($1)
         RETURNING id, created_at, updated_at`,
        [req.user.id]
      );
      const conversationId = createdConversation.rows[0].id;

      await db.query(
        `INSERT INTO conversation_participants (conversation_id, user_id)
         VALUES ($1, $2), ($1, $3)`,
        [conversationId, req.user.id, participantUserId]
      );

      return res.status(201).json({
        conversationId,
        createdAt: createdConversation.rows[0].created_at
      });
    })
  );

  router.get(
    "/conversations",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const result = await db.query(
        `SELECT c.id AS conversation_id,
                c.updated_at,
                p.user_id AS other_user_id,
                pr.display_name AS other_display_name,
                u.username AS other_username,
                pr.avatar_url AS other_avatar_url,
                lm.id AS last_message_id,
                lm.body AS last_message_body,
                lm.created_at AS last_message_at,
                COALESCE((
                  SELECT COUNT(*)::int
                  FROM messages m2
                  WHERE m2.conversation_id = c.id
                    AND (cp.last_read_message_id IS NULL OR m2.id > cp.last_read_message_id)
                    AND m2.sender_id <> $1
                ), 0) AS unread_count
         FROM conversation_participants cp
         JOIN conversations c ON c.id = cp.conversation_id
         JOIN conversation_participants p
           ON p.conversation_id = c.id
          AND p.user_id <> $1
         JOIN users u ON u.id = p.user_id
         JOIN profiles pr ON pr.user_id = p.user_id
         LEFT JOIN LATERAL (
           SELECT m.id, m.body, m.created_at
           FROM messages m
           WHERE m.conversation_id = c.id
           ORDER BY m.id DESC
           LIMIT 1
         ) lm ON true
         WHERE cp.user_id = $1
           AND NOT EXISTS (
             SELECT 1
             FROM user_blocks ub
             WHERE (ub.user_id = $1 AND ub.blocked_user_id = p.user_id)
                OR (ub.user_id = p.user_id AND ub.blocked_user_id = $1)
           )
           AND NOT EXISTS (
             SELECT 1
             FROM user_mutes um
             WHERE um.user_id = $1
               AND um.muted_user_id = p.user_id
           )
         ORDER BY c.updated_at DESC, c.id DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );

      res.status(200).json({ limit, offset, items: result.rows });
    })
  );

  router.get(
    "/conversations/:conversationId/messages",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const conversationId = Number(req.params.conversationId);
      if (!conversationId) {
        throw httpError(400, "conversationId must be a number");
      }
      await ensureParticipant(conversationId, req.user.id);

      const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
      const beforeId = req.query.beforeId ? Number(req.query.beforeId) : null;
      if (req.query.beforeId && !beforeId) {
        throw httpError(400, "beforeId must be a number");
      }

      const result = await db.query(
        `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at,
                pr.display_name AS sender_display_name,
                u.username AS sender_username
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         JOIN profiles pr ON pr.user_id = m.sender_id
         WHERE m.conversation_id = $1
           AND ($2::int IS NULL OR m.id < $2::int)
         ORDER BY m.id DESC
         LIMIT $3`,
        [conversationId, beforeId, limit + 1]
      );

      const hasMore = result.rows.length > limit;
      const items = hasMore ? result.rows.slice(0, limit) : result.rows;
      const nextBeforeId = hasMore ? items[items.length - 1].id : null;

      res.status(200).json({
        items,
        hasMore,
        nextBeforeId
      });
    })
  );

  router.post(
    "/conversations/:conversationId/messages",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const conversationId = Number(req.params.conversationId);
      if (!conversationId) {
        throw httpError(400, "conversationId must be a number");
      }
      await ensureParticipant(conversationId, req.user.id);

      const body = requireString(req.body?.body, "body", 1, 4000);
      if (hasBlockedTerm(body)) {
        throw httpError(400, "Message includes blocked language");
      }
      const peer = await db.query(
        `SELECT user_id
         FROM conversation_participants
         WHERE conversation_id = $1
           AND user_id <> $2
         LIMIT 1`,
        [conversationId, req.user.id]
      );
      if (peer.rowCount > 0) {
        await ensureNoSafetyBlockBetween(req.user.id, peer.rows[0].user_id);
      }
      const created = await db.query(
        `INSERT INTO messages (conversation_id, sender_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, conversation_id, sender_id, body, created_at`,
        [conversationId, req.user.id, body]
      );
      await db.query(
        `UPDATE conversations
         SET updated_at = NOW()
         WHERE id = $1`,
        [conversationId]
      );

      const row = created.rows[0];
      if (peer.rowCount > 0) {
        const peerUserId = peer.rows[0].user_id;
        const senderProfile = await db.query(
          `SELECT display_name FROM profiles WHERE user_id = $1 LIMIT 1`,
          [req.user.id]
        );
        const senderDisplayName = senderProfile.rows[0]?.display_name || "Someone";
        const payload = {
          conversationId,
          senderId: req.user.id,
          senderDisplayName,
          messageId: row.id,
          bodyPreview: body.slice(0, 200)
        };
        try {
          await db.query(
            `INSERT INTO notifications (user_id, type, payload)
             VALUES ($1, 'direct_message', $2::jsonb)`,
            [peerUserId, JSON.stringify(payload)]
          );
        } catch {
          // Non-fatal: message already stored
        }
        if (pushNotifications && typeof pushNotifications.sendUserPush === "function") {
          void pushNotifications
            .sendUserPush({
              userId: peerUserId,
              type: "direct_message",
              payload
            })
            .catch(() => {});
        }
      }

      res.status(201).json(row);
    })
  );

  router.post(
    "/conversations/:conversationId/read",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const conversationId = Number(req.params.conversationId);
      if (!conversationId) {
        throw httpError(400, "conversationId must be a number");
      }
      await ensureParticipant(conversationId, req.user.id);

      const messageId = req.body?.messageId ? Number(req.body.messageId) : null;
      if (req.body?.messageId && !messageId) {
        throw httpError(400, "messageId must be a number");
      }

      await db.query(
        `UPDATE conversation_participants
         SET last_read_message_id = COALESCE($1, last_read_message_id),
             last_read_at = NOW()
         WHERE conversation_id = $2
           AND user_id = $3`,
        [messageId, conversationId, req.user.id]
      );

      res.status(200).json({ status: "ok", conversationId, messageId });
    })
  );

  return router;
}

module.exports = {
  createMessagesRouter
};
