"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { businessChatAsk, fetchBusiness } from "@/lib/businesses";
import { ErrorState, LoadingState } from "@/components/states";

export default function BusinessDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["business", id],
    queryFn: () => fetchBusiness(id),
    enabled: Number.isFinite(id) && id > 0
  });

  const chatMutation = useMutation({
    mutationFn: () => businessChatAsk(id, question.trim(), "profile"),
    onSuccess: (data) => setAnswer(data.reply)
  });

  if (!Number.isFinite(id) || id <= 0) {
    return <ErrorState message="Invalid business" />;
  }
  if (detailQuery.isLoading) {
    return <LoadingState label="Loading…" />;
  }
  if (detailQuery.error || !detailQuery.data) {
    return <ErrorState message={(detailQuery.error as Error)?.message || "Not found"} />;
  }

  const b = detailQuery.data;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`;

  return (
    <article className="mx-auto max-w-lg space-y-4">
      <Link href="/search" className="text-sm text-muted hover:underline">
        Back to Search
      </Link>
      <div className="surface-card space-y-2 rounded-panel border border-black/10 p-4">
        <h1 className="text-2xl font-semibold">{b.name}</h1>
        {b.category ? <p className="text-sm font-medium text-muted">{b.category}</p> : null}
        {b.addressDisplay ? <p className="text-sm text-text">{b.addressDisplay}</p> : null}
        {b.description ? <p className="text-sm leading-relaxed text-text">{b.description}</p> : null}
        {b.websiteUrl ? (
          <a href={b.websiteUrl} className="text-sm font-medium text-sky-700 underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
            Website
          </a>
        ) : null}
        <a href={mapsUrl} className="btn-secondary inline-block text-center text-sm" target="_blank" rel="noreferrer">
          Directions
        </a>
      </div>
      <div className="surface-card space-y-3 rounded-panel border border-black/10 p-4">
        <h2 className="text-lg font-semibold">Ask about this business</h2>
        <p className="text-xs text-muted">
          Answers use only the details on this page. For hours or pricing, contact the business directly.
        </p>
        <textarea
          className="input min-h-24 w-full"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Your question"
        />
        <button
          type="button"
          className="btn-primary w-full"
          disabled={!question.trim() || chatMutation.isPending}
          onClick={() => chatMutation.mutate()}
        >
          {chatMutation.isPending ? "Thinking…" : "Ask"}
        </button>
        {chatMutation.isError ? <ErrorState message="Could not get an answer." /> : null}
        {answer ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{answer}</p> : null}
      </div>
    </article>
  );
}
