import { apiRequest } from "@/lib/api";

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
  viewerInvited?: boolean;
  viewedWithInviteLink?: boolean;
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

/** Events hosted by a user (respects visibility: public, or viewer is host / RSVP'd). */
export async function fetchEventsByHost(hostUserId: number, opts?: { limit?: number; offset?: number }) {
  const q = new URLSearchParams({
    hostUserId: String(hostUserId),
    limit: String(opts?.limit ?? 40),
    offset: String(opts?.offset ?? 0),
    source: "web_profile"
  });
  return apiRequest<{ items: EventRecord[] }>(`/events?${q.toString()}`, { auth: true });
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

function appendInviteToken(q: URLSearchParams, inviteToken?: string | null) {
  if (inviteToken != null && inviteToken !== "") {
    q.set("inviteToken", inviteToken);
  }
}

export type EventDetailFetchOpts = { source?: string; inviteToken?: string | null };

export async function fetchEventDetail(id: number, opts?: EventDetailFetchOpts) {
  const q = new URLSearchParams();
  if (opts?.source) {
    q.set("source", opts.source);
  }
  appendInviteToken(q, opts?.inviteToken);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return apiRequest<EventRecord>(`/events/${id}${suffix}`);
}

export async function setEventRsvp(
  id: number,
  status: "interested" | "going" | "none",
  opts?: { source?: string; inviteToken?: string | null }
) {
  const body: Record<string, unknown> = {
    status,
    source: opts?.source ?? "web_event_detail"
  };
  if (opts?.inviteToken != null && opts.inviteToken !== "") {
    body.inviteToken = opts.inviteToken;
  }
  return apiRequest<{ eventId: number; status: EventRsvpStatus }>(`/events/${id}/rsvp`, {
    method: "POST",
    auth: true,
    body
  });
}

export async function fetchEventChat(
  id: number,
  opts?: { limit?: number; beforeId?: number; inviteToken?: string | null }
) {
  const limit = opts?.limit ?? 60;
  const q = new URLSearchParams({ limit: String(limit) });
  if (opts?.beforeId != null) {
    q.set("beforeId", String(opts.beforeId));
  }
  appendInviteToken(q, opts?.inviteToken);
  return apiRequest<{ items: EventChatMessage[] }>(`/events/${id}/chat?${q.toString()}`, {
    auth: true
  });
}

export async function sendEventChatMessage(
  id: number,
  body: string,
  opts?: { source?: string; inviteToken?: string | null }
) {
  const payload: Record<string, unknown> = {
    body,
    source: opts?.source ?? "web_event_detail"
  };
  if (opts?.inviteToken != null && opts.inviteToken !== "") {
    payload.inviteToken = opts.inviteToken;
  }
  return apiRequest<EventChatMessage>(`/events/${id}/chat`, {
    method: "POST",
    auth: true,
    body: payload
  });
}

export type EventInviteLinkRow = {
  id: number;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  active: boolean;
};

export async function fetchEventInviteLinks(eventId: number) {
  return apiRequest<{ items: EventInviteLinkRow[] }>(`/events/${eventId}/invite-links`, { auth: true });
}

export async function createEventInviteLink(eventId: number, opts?: { expiresInDays?: number }) {
  return apiRequest<{
    id: number;
    inviteToken: string;
    createdAt: string;
    expiresAt: string | null;
    message: string;
  }>(`/events/${eventId}/invite-links`, {
    method: "POST",
    auth: true,
    body: opts?.expiresInDays != null ? { expiresInDays: opts.expiresInDays } : {}
  });
}

export async function revokeEventInviteLink(eventId: number, linkId: number) {
  return apiRequest<{ revoked: boolean }>(`/events/${eventId}/invite-links/${linkId}`, {
    method: "DELETE",
    auth: true
  });
}

export async function inviteUsersToEvent(eventId: number, userIds: number[]) {
  return apiRequest<{ invited: number; requested: number }>(`/events/${eventId}/invites/users`, {
    method: "POST",
    auth: true,
    body: { userIds }
  });
}

export type EventAttendeeRsvp = {
  userId: number;
  displayName: string | null;
  status: string;
  updatedAt: string;
};

export type EventPendingInvite = {
  userId: number;
  displayName: string | null;
  invitedAt: string;
};

export async function fetchEventAttendees(eventId: number) {
  return apiRequest<{ rsvps: EventAttendeeRsvp[]; pendingInvites: EventPendingInvite[] }>(
    `/events/${eventId}/attendees`,
    { auth: true }
  );
}

export async function searchUsersForInvite(q: string, limit = 8) {
  const trimmed = q.trim();
  if (!trimmed) {
    return { items: [] as Array<{ user_id: number; display_name: string; username: string }> };
  }
  return apiRequest<{ items: Array<{ user_id: number; display_name: string; username: string }> }>(
    `/search/users?q=${encodeURIComponent(trimmed)}&limit=${String(limit)}`,
    { auth: true }
  );
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
    mutes: Array<{ user_id: number; user_display_name?: string | null; reason?: string | null; created_at: string }>;
    actions: Array<{
      id: number;
      action_type: string;
      actor_display_name?: string | null;
      target_display_name?: string | null;
      reason?: string | null;
      created_at: string;
    }>;
  }>(`/events/${eventId}/chat/moderation`, { auth: true });
}
