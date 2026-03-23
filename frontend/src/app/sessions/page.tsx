"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

type SessionItem = {
  id: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

type SessionsResponse = {
  items: SessionItem[];
};

export default function SessionsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiRequest<SessionsResponse>("/users/me/sessions", { auth: true })
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: number) =>
      apiRequest(`/users/me/sessions/${sessionId}/revoke`, {
        method: "POST",
        auth: true
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] })
  });

  if (query.isLoading) return <LoadingState label="Loading sessions..." />;
  if (query.error) return <ErrorState message="Could not load sessions." />;
  if (!query.data || query.data.items.length === 0) return <EmptyState title="No active sessions found." />;

  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">My Sessions</h1>
      {query.data.items.map((session) => (
        <article key={session.id} className="surface-card">
          <p className="text-sm">Session #{session.id}</p>
          <p className="text-xs text-muted">Created: {new Date(session.created_at).toLocaleString()}</p>
          <p className="text-xs text-muted">Expires: {new Date(session.expires_at).toLocaleString()}</p>
          <p className="text-xs text-muted">Revoked: {session.revoked_at ? new Date(session.revoked_at).toLocaleString() : "No"}</p>
          {!session.revoked_at ? (
            <button className="btn-secondary mt-3" onClick={() => revokeMutation.mutate(session.id)}>
              Revoke
            </button>
          ) : null}
        </article>
      ))}
    </section>
  );
}
