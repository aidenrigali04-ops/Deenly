const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");

/**
 * Creates a WebSocket service attached to an HTTP server.
 *
 * Events sent/received:
 *   typing_start  { conversationId }
 *   typing_stop   { conversationId }
 *   new_message   { conversationId, message }
 *   message_edited  { conversationId, messageId, body, edited_at }
 *   message_deleted { conversationId, messageId, mode }
 *   read_receipt    { conversationId, messageId }
 */
function createWebSocketService({ server, config, db, logger }) {
  const wss = new WebSocketServer({ noServer: true });

  // userId -> Set<WebSocket>
  const clients = new Map();

  function getSecret() {
    return config?.jwtAccessSecret;
  }

  // ── Upgrade handler (auth via ?token=JWT) ──────────────────────────
  server.on("upgrade", async (request, socket, head) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get("token");
      if (!token) {
        socket.destroy();
        return;
      }

      const secret = getSecret();
      if (!secret) {
        socket.destroy();
        return;
      }

      const payload = jwt.verify(token, secret);
      const userId = payload.sub;

      const result = await db.query(
        "SELECT id FROM users WHERE id = $1 AND is_active = true LIMIT 1",
        [userId]
      );
      if (result.rowCount === 0) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.userId = userId;
        wss.emit("connection", ws);
      });
    } catch {
      socket.destroy();
    }
  });

  // ── Connection lifecycle ───────────────────────────────────────────
  wss.on("connection", (ws) => {
    const userId = ws.userId;

    if (!clients.has(userId)) {
      clients.set(userId, new Set());
    }
    clients.get(userId).add(ws);

    // Mark online
    setPresence(userId, true).catch(() => {});

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw);
        handleClientEvent(userId, data);
      } catch {
        // ignore malformed
      }
    });

    ws.on("close", () => {
      const set = clients.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          clients.delete(userId);
          setPresence(userId, false).catch(() => {});
        }
      }
    });

    ws.on("error", () => {
      ws.terminate();
    });
  });

  // ── Presence helpers ───────────────────────────────────────────────
  async function setPresence(userId, online) {
    await db.query(
      `INSERT INTO user_presence (user_id, is_online, last_seen_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET is_online = $2, last_seen_at = NOW()`,
      [userId, online]
    );
  }

  // ── Broadcast helper ───────────────────────────────────────────────
  function broadcastToUser(userId, event) {
    const set = clients.get(Number(userId));
    if (!set) return;
    const payload = JSON.stringify(event);
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    }
  }

  // ── Handle incoming client events ──────────────────────────────────
  async function handleClientEvent(senderId, data) {
    const { type, conversationId } = data;
    if (!type || !conversationId) return;

    // Verify sender is participant
    const check = await db.query(
      "SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2",
      [conversationId, senderId]
    );
    if (check.rowCount === 0) return;

    // Find the other participant
    const peer = await db.query(
      "SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id != $2",
      [conversationId, senderId]
    );
    if (peer.rowCount === 0) return;
    const peerId = peer.rows[0].user_id;

    if (type === "typing_start" || type === "typing_stop") {
      broadcastToUser(peerId, { type, conversationId, userId: senderId });
    }
  }

  // ── Public API for REST routes to push events ──────────────────────
  return {
    broadcastToUser,
    clients,

    /** Notify peer about a new message */
    notifyNewMessage(conversationId, recipientId, message) {
      broadcastToUser(recipientId, {
        type: "new_message",
        conversationId,
        message,
      });
    },

    /** Notify peer about an edited message */
    notifyMessageEdited(conversationId, recipientId, messageId, body, editedAt) {
      broadcastToUser(recipientId, {
        type: "message_edited",
        conversationId,
        messageId,
        body,
        edited_at: editedAt,
      });
    },

    /** Notify peer about a deleted message */
    notifyMessageDeleted(conversationId, recipientId, messageId, mode) {
      broadcastToUser(recipientId, {
        type: "message_deleted",
        conversationId,
        messageId,
        mode,
      });
    },

    /** Notify peer about a read receipt */
    notifyReadReceipt(conversationId, recipientId, messageId) {
      broadcastToUser(recipientId, {
        type: "read_receipt",
        conversationId,
        messageId,
      });
    },

    /** Graceful shutdown */
    close() {
      for (const ws of wss.clients) {
        ws.terminate();
      }
    },
  };
}

module.exports = { createWebSocketService };
