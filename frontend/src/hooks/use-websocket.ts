"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/storage";
import { useSessionStore } from "@/store/session-store";

type WsEvent =
  | { type: "new_message"; conversationId: number; message: unknown }
  | { type: "message_edited"; conversationId: number; messageId: number; body: string; edited_at: string }
  | { type: "message_deleted"; conversationId: number; messageId: number; mode: string }
  | { type: "read_receipt"; conversationId: number; messageId: number }
  | { type: "typing_start"; conversationId: number; userId: number }
  | { type: "typing_stop"; conversationId: number; userId: number };

const WS_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000")
  .replace(/^http/, "ws")
  .replace(/\/api\/v1$/, "")
  .replace(/\/api$/, "");

const RECONNECT_MIN = 1000;
const RECONNECT_MAX = 30000;

export function useWebSocket() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoff = useRef(RECONNECT_MIN);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<number, number>>(new Map()); // conversationId -> userId

  const connect = useCallback(() => {
    if (!userId) return;
    const token = getAccessToken();
    if (!token) return;

    const ws = new WebSocket(`${WS_BASE}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      backoff.current = RECONNECT_MIN;
    };

    ws.onmessage = (event) => {
      try {
        const data: WsEvent = JSON.parse(event.data);
        handleEvent(data);
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleEvent(data: WsEvent) {
    switch (data.type) {
      case "new_message":
        queryClient.invalidateQueries({ queryKey: ["messages-thread", data.conversationId] });
        queryClient.invalidateQueries({ queryKey: ["messages-conversations"] });
        queryClient.invalidateQueries({ queryKey: ["unread-message-count"] });
        break;
      case "message_edited":
        queryClient.invalidateQueries({ queryKey: ["messages-thread", data.conversationId] });
        break;
      case "message_deleted":
        queryClient.invalidateQueries({ queryKey: ["messages-thread", data.conversationId] });
        queryClient.invalidateQueries({ queryKey: ["messages-conversations"] });
        break;
      case "read_receipt":
        queryClient.invalidateQueries({ queryKey: ["messages-read-status", data.conversationId] });
        break;
      case "typing_start":
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(data.conversationId, data.userId);
          return next;
        });
        break;
      case "typing_stop":
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(data.conversationId);
          return next;
        });
        break;
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = setTimeout(() => {
      backoff.current = Math.min(backoff.current * 2, RECONNECT_MAX);
      connect();
    }, backoff.current);
  }

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendEvent = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const sendTypingStart = useCallback(
    (conversationId: number) => sendEvent({ type: "typing_start", conversationId }),
    [sendEvent]
  );

  const sendTypingStop = useCallback(
    (conversationId: number) => sendEvent({ type: "typing_stop", conversationId }),
    [sendEvent]
  );

  return { connected, typingUsers, sendTypingStart, sendTypingStop };
}
