"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { businessChatAsk, fetchBusiness } from "@/lib/businesses";
import { ErrorState, LoadingState } from "@/components/states";
import { fetchCreatorProducts, formatMinorCurrency } from "@/lib/monetization";

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

  const ownerId = detailQuery.data?.ownerUserId;
  const productsQuery = useQuery({
    queryKey: ["business-owner-products", ownerId],
    queryFn: () => fetchCreatorProducts(ownerId!),
    enabled: typeof ownerId === "number" && ownerId > 0
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
      {productsQuery.isLoading ? <p className="text-sm text-muted">Loading offers…</p> : null}
      {productsQuery.error ? (
        <p className="text-sm text-rose-700">Could not load offers.</p>
      ) : null}
      {(productsQuery.data?.items || []).length > 0 ? (
        <div className="surface-card space-y-3 rounded-panel border border-black/10 p-4">
          <h2 className="text-lg font-semibold">Offers</h2>
          <p className="text-xs text-muted">Published listings from this business on Deenly.</p>
          <ul className="space-y-2">
            {(productsQuery.data?.items || []).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/products/${p.id}`}
                  className="flex items-start justify-between gap-3 rounded-control border border-black/10 bg-black/[0.02] p-3 hover:bg-black/[0.04]"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-text">{p.title}</span>
                    {p.description ? (
                      <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{p.description}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-semibold text-sky-800 dark:text-sky-300">
                    {formatMinorCurrency(p.price_minor, p.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
