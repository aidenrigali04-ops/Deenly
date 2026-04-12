const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { requireString } = require("../../utils/validators");

function createMessagesRouter({ db, config, pushNotifications = null }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  const EDIT_WINDOW_MS = 15 * 60 * 1000;
  const UNSEND_WINDOW_MS = 5 * 60 * 1000;

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

  // ── Create or open conversation ──────────────────────────────────────

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

  // ── List conversations ───────────────────────────────────────────────

  router.get(
    "/conversations",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const showArchived = req.query.archived === "true";

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
                    AND m2.deleted_at IS NULL
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
             AND m.deleted_at IS NULL
           ORDER BY m.id DESC
           LIMIT 1
         ) lm ON true
         WHERE cp.user_id = $1
           AND ($4::boolean IS TRUE AND cp.archived_at IS NOT NULL
                OR $4::boolean IS NOT TRUE AND cp.archived_at IS NULL)
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
        [req.user.id, limit, offset, showArchived]
      );

      res.status(200).json({ limit, offset, items: result.rows });
    })
  );

  // ── Get messages in conversation ─────────────────────────────────────

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
                m.edited_at, m.deleted_at, m.deleted_for_sender_only,
                pr.display_name AS sender_display_name,
                u.username AS sender_username
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         JOIN profiles pr ON pr.user_id = m.sender_id
         WHERE m.conversation_id = $1
           AND ($2::int IS NULL OR m.id < $2::int)
           AND (m.deleted_at IS NULL
                OR (m.deleted_for_sender_only = true AND m.sender_id <> $4))
         ORDER BY m.id DESC
         LIMIT $3`,
        [conversationId, beforeId, limit + 1, req.user.id]
      );

      const hasMore = result.rows.length > limit;
      const items = hasMore ? result.rows.slice(0, limit) : result.rows;
      const nextBeforeId = hasMore ? items[items.length - 1].id : null;

      const mapped = items.map((row) => {
        if (row.deleted_at && !row.deleted_for_sender_only) {
          return {
            id: row.id,
            conversation_id: row.conversation_id,
            sender_id: row.sender_id,
            body: null,
            created_at: row.created_at,
            edited_at: null,
            is_unsent: true,
            sender_display_name: row.sender_display_name,
            sender_username: row.sender_username
          };
        }
        return {
          id: row.id,
          conversation_id: row.conversation_id,
          sender_id: row.sender_id,
          body: row.body,
          created_at: row.created_at,
          edited_at: row.edited_at,
          is_unsent: false,
          sender_display_name: row.sender_display_name,
          sender_username: row.sender_username
        };
      });

      res.status(200).json({ items: mapped, hasMore, nextBeforeId });
    })
  );

  // ── Send message ─────────────────────────────────────────────────────

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

      // Push via WebSocket
      const wsService = req.app.locals.wsService;
      if (wsService && peer.rowCount > 0) {
        wsService.notifyNewMessage(conversationId, peer.rows[0].user_id, {
          ...row,
          edited_at: null,
          is_unsent: false,
        });
      }

      res.status(201).json({ ...row, edited_at: null, is_unsent: false });
    })
  );

  // ── Edit message ─────────────────────────────────────────────────────

  router.patch(
    "/conversations/:conversationId/messages/:messageId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const conversationId = Number(req.params.conversationId);
      const messageId = Number(req.params.messageId);
      if (!conversationId || !messageId) {
        throw httpError(400, "conversationId and messageId must be numbers");
      }
      await ensureParticipant(conversationId, req.user.id);

      const newBody = requireString(req.body?.body, "body", 1, 4000);
      if (hasBlockedTerm(newBody)) {
        throw httpError(400, "Message includes blocked language");
      }

      const msg = await db.query(
        `SELECT id, sender_id, created_at, deleted_at
         FROM messages
         WHERE id = $1 AND conversation_id = $2
         LIMIT 1`,
        [messageId, conversationId]
      );
      if (msg.rowCount === 0) {
        throw httpError(404, "Message not found");
      }
      const message = msg.rows[0];
      if (message.sender_id !== req.user.id) {
        throw httpError(403, "Can only edit your own messages");
      }
      if (message.deleted_at) {
        throw httpError(400, "Cannot edit a deleted message");
      }
      if (Date.now() - new Date(message.created_at).getTime() > EDIT_WINDOW_MS) {
        throw httpError(400, "Edit window has expired (15 minutes)");
      }

      const updated = await db.query(
        `UPDATE messages
         SET body = $1, edited_at = NOW()
         WHERE id = $2
         RETURNING id, conversation_id, sender_id, body, created_at, edited_at`,
        [newBody, messageId]
      );

      // Push edit via WebSocket
      const wsService = req.app.locals.wsService;
      if (wsService) {
        const peer = await db.query(
          `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id <> $2`,
          [conversationId, req.user.id]
        );
        if (peer.rowCount > 0) {
          wsService.notifyMessageEdited(conversationId, peer.rows[0].user_id, messageId, newBody, updated.rows[0].edited_at);
        }
      }

      res.status(200).json({ ...updated.rows[0], is_unsent: false });
    })
  );

  // ── Delete / unsend message ──────────────────────────────────────────

  router.delete(
    "/conversations/:conversationId/messages/:messageId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const conversationId = Number(req.params.conversationId);
      const messageId = Number(req.params.messageId);
      if (!conversationId || !messageId) {
        throw httpError(400, "conversationId and messageId must be numbers");
      }
      await ensureParticipant(conversationId, req.user.id);

      const mode = req.query.mode === "unsend" ? "unsend" : "delete_for_me";

      const msg = await db.query(
        `SELECT id, sender_id, created_at, deleted_at
         FROM messages
         WHERE id = $1 AND conversation_id = $2
         LIMIT 1`,
        [messageId, conversationId]
      );
      if (msg.rowCount === 0) {
        throw httpError(404, "Message not found");
      }
      const message = msg.rows[0];
      if (message.sender_id !== req.user.id) {
        throw httpError(403, "Can only delete your own messages");
      }
      if (message.deleted_at) {
        throw httpError(400, "Message already deleted");
      }

      if (mode === "unsend") {
        if (Date.now() - new Date(message.created_at).getTime() > UNSEND_WINDOW_MS) {
          throw httpError(400, "Unsend window has expired (5 minutes)");
        }
        await db.query(
          `UPDATE messages
           SET deleted_at = NOW(), deleted_for_sender_only = false
           WHERE id = $1`,
          [messageId]
        );
      } else {
        await db.query(
          `UPDATE messages
           SET deleted_at = NOW(), deleted_for_sender_only = true
           WHERE id = $1`,
          [messageId]
        );
      }

      // Push unsend via WebSocket (delete_for_me is private)
      if (mode === "unsend") {
        const wsService = req.app.locals.wsService;
        if (wsService) {
          const peer = await db.query(
            `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id <> $2`,
            [conversationId, req.user.id]
          );
          if (peer.rowCount > 0) {
            wsService.notifyMessageDeleted(conversationId, peer.rows[0].user_id, messageId, mode);
          }
        }
      }

      res.status(200).json({ status: "ok", messageId, mode });
    })
  );

  // ── Mark conversation read ───────────────────────────────────────────

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

      // Push read receipt via WebSocket
      if (messageId) {
        const wsService = req.app.locals.wsService;
        if (wsService) {
          const peer = await db.query(
            `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id <> $2`,
            [conversationId, req.user.id]
          );
          if (peer.rowCount > 0) {
            wsService.notifyReadReceipt(conversationId, peer.rows[0].user_id, messageId);
          }
        }
      }

      res.status(200).json({ status: "ok", conversationId, messageId });
    })
  );

  // ── Read status (for read receipts) ──────────────────────────────────

  router.get(
    "/conversations/:conversationId/read-status",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const conversationId = Number(req.params.conversationId);
      if (!conversationId) {
        throw httpError(400, "conversationId must be a number");
      }
      await ensureParticipant(conversationId, req.user.id);

      const result = await db.query(
        `SELECT cp.last_read_message_id, cp.last_read_at
         FROM conversation_participants cp
         WHERE cp.conversation_id = $1
           AND cp.user_id <> $2
         LIMIT 1`,
        [conversationId, req.user.id]
      );

      const row = result.rows[0] || {};
      res.status(200).json({
        lastReadMessageId: row.last_read_message_id || null,
        lastReadAt: row.last_read_at || null
      });
    })
  );

  // ── Archive / unarchive conversation ─────────────────────────────────

  router.post(
    "/conversations/:conversationId/archive",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const conversationId = Number(req.params.conversationId);
      if (!conversationId) {
        throw httpError(400, "conversationId must be a number");
      }
      await ensureParticipant(conversationId, req.user.id);

      await db.query(
        `UPDATE conversation_participants
         SET archived_at = NOW()
         WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, req.user.id]
      );

      res.status(200).json({ status: "archived", conversationId });
    })
  );

  router.post(
    "/conversations/:conversationId/unarchive",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const conversationId = Number(req.params.conversationId);
      if (!conversationId) {
        throw httpError(400, "conversationId must be a number");
      }
      await ensureParticipant(conversationId, req.user.id);

      await db.query(
        `UPDATE conversation_participants
         SET archived_at = NULL
         WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, req.user.id]
      );

      res.status(200).json({ status: "unarchived", conversationId });
    })
  );

  // ── User presence ────────────────────────────────────────────────────

  router.get(
    "/presence/:userId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const userId = Number(req.params.userId);
      if (!userId) {
        throw httpError(400, "userId must be a number");
      }

      const result = await db.query(
        `SELECT is_online, last_seen_at FROM user_presence WHERE user_id = $1 LIMIT 1`,
        [userId]
      );

      if (result.rowCount === 0) {
        return res.status(200).json({ isOnline: false, lastSeenAt: null });
      }

      const row = result.rows[0];
      res.status(200).json({
        isOnline: row.is_online,
        lastSeenAt: row.last_seen_at,
      });
    })
  );

  // ── Unread count ─────────────────────────────────────────────────────

  router.get(
    "/unread-count",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT COUNT(DISTINCT cp.conversation_id)::int AS cnt
         FROM conversation_participants cp
         JOIN messages m
           ON m.conversation_id = cp.conversation_id
          AND m.sender_id <> $1
          AND m.deleted_at IS NULL
          AND (cp.last_read_message_id IS NULL OR m.id > cp.last_read_message_id)
         WHERE cp.user_id = $1
           AND cp.archived_at IS NULL`,
        [req.user.id]
      );
      res.status(200).json({ unreadConversationCount: result.rows[0]?.cnt || 0 });
    })
  );

  return router;
}

module.exports = {
  createMessagesRouter
};
