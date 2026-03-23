"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

type ReflectItem = {
  id: number;
  post_id: number;
  content: string;
  post_type: string;
  created_at: string;
};

type ReflectResponse = {
  items: ReflectItem[];
};

export default function ReflectLaterPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reflect-later"],
    queryFn: () => apiRequest<ReflectResponse>("/interactions/me?type=reflect_later&limit=50", { auth: true })
  });

  if (isLoading) return <LoadingState label="Loading saved reflections..." />;
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!data || data.items.length === 0) {
    return <EmptyState title="No saved reflections yet." />;
  }

  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">Reflect Later</h1>
      {data.items.map((item) => (
        <article key={item.id} className="surface-card">
          <p className="text-xs uppercase tracking-wide text-muted">{item.post_type}</p>
          <p className="mt-2 text-sm">{item.content}</p>
          <Link href={`/posts/${item.post_id}`} className="mt-3 inline-flex text-sm text-accent">
            Open post
          </Link>
        </article>
      ))}
    </section>
  );
}
