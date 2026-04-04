import { apiRequest } from "./api";

export type EventVisibility = "public" | "private" | "invite";
export type EventStatus = "scheduled" | "canceled" | "completed";
export type EventRsvpStatus = "interested" | "going" | null;

export type EventRecord = {
  id: number;
  hostUserId: number;
  hostDisplayName: string | null;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string | null;
  isOnline: boolean;
  onlineUrl: string | null;
  addressDisplay: string | null;
  latitude: number | null;
  longitude: number | null;
  visibility: EventVisibility;
  capacity: number | null;
  status: EventStatus;
  rsvpInterestedCount: number;
  rsvpGoingCount: number;
  viewerRsvpStatus: EventRsvpStatus;
  canJoinChat: boolean;
  distanceM: number | null;
  createdAt: string;
  updatedAt: string;
};

export type EventChatMessage = {
  id: number;
  eventId: number;
  senderUserId: number;
  senderDisplayName?: string | null;
  body: string;
  createdAt: string;
};

export async function fetchEventsNear(params: {
  lat: number;
  lng: number;
  radiusM?: number;
  limit?: number;
  timeWindow?: "upcoming" | "today" | "this_week";
}) {
  const q = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    radiusM: String(params.radiusM ?? 25000),
    limit: String(params.limit ?? 40),
    timeWindow: params.timeWindow ?? "upcoming"
  });
  return apiRequest<{ items: EventRecord[] }>(`/events/near?${q.toString()}`);
}

export async function updateEvent(
  id: number,
  body: Partial<{
    title: string;
    description: string | null;
    startsAt: string;
    endsAt: string | null;
    timezone: string | null;
    isOnline: boolean;
    onlineUrl: string | null;
    addressDisplay: string | null;
    latitude: number | null;
    longitude: number | null;
    visibility: EventVisibility;
    capacity: number | null;
    status: EventStatus;
  }>
) {
  return apiRequest<EventRecord>(`/events/${id}`, {
    method: "PATCH",
    auth: true,
    body
  });
}

export async function createEvent(body: {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  timezone?: string | null;
  isOnline?: boolean;
  onlineUrl?: string | null;
  addressDisplay?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  visibility?: EventVisibility;
  capacity?: number | null;
  source?: string;
}) {
  return apiRequest<EventRecord>("/events", {
    method: "POST",
    auth: true,
    body
  });
}

export async function fetchEventDetail(id: number, source?: string) {
  const q = new URLSearchParams();
  if (source) {
    q.set("source", source);
  }
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return apiRequest<EventRecord>(`/events/${id}${suffix}`);
}

export async function setEventRsvp(id: number, status: "interested" | "going" | "none", source?: string) {
  return apiRequest<{ eventId: number; status: EventRsvpStatus }>(`/events/${id}/rsvp`, {
    method: "POST",
    auth: true,
    body: { status, source: source ?? "mobile_event_detail" }
  });
}

export async function fetchEventChat(id: number, opts?: { limit?: number; beforeId?: number }) {
  const limit = opts?.limit ?? 60;
  const q = new URLSearchParams({ limit: String(limit) });
  if (opts?.beforeId != null) {
    q.set("beforeId", String(opts.beforeId));
  }
  return apiRequest<{ items: EventChatMessage[] }>(`/events/${id}/chat?${q.toString()}`, {
    auth: true
  });
}

export async function sendEventChatMessage(id: number, body: string, source?: string) {
  return apiRequest<EventChatMessage>(`/events/${id}/chat`, {
    method: "POST",
    auth: true,
    body: { body, source: source ?? "mobile_event_detail" }
  });
}

export async function muteEventChatUser(eventId: number, userId: number, reason?: string) {
  return apiRequest<{ muted: boolean }>(`/events/${eventId}/chat/mute`, {
    method: "POST",
    auth: true,
    body: { userId, reason: reason || null }
  });
}

export async function unmuteEventChatUser(eventId: number, userId: number) {
  return apiRequest<{ muted: boolean }>(`/events/${eventId}/chat/mute/${userId}`, {
    method: "DELETE",
    auth: true
  });
}

export async function removeEventAttendee(eventId: number, userId: number, reason?: string) {
  return apiRequest<{ removed: boolean }>(`/events/${eventId}/rsvps/${userId}`, {
    method: "DELETE",
    auth: true,
    body: { reason: reason || null }
  });
}

export async function reportEventChatUser(eventId: number, userId: number, reason: string, note?: string) {
  return apiRequest<{ reported: boolean }>(`/events/${eventId}/chat/report`, {
    method: "POST",
    auth: true,
    body: { userId, reason, note: note || null }
  });
}

export async function fetchEventChatModeration(eventId: number) {
  return apiRequest<{
    mutes: { user_id: number; user_display_name?: string | null; reason?: string | null; created_at: string }[];
    actions: {
      id: number;
      action_type: string;
      actor_display_name?: string | null;
      target_display_name?: string | null;
      reason?: string | null;
      created_at: string;
    }[];
  }>(`/events/${eventId}/chat/moderation`, { auth: true });
}
