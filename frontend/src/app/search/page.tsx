"use client";

import { FormEvent, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { fetchBusinessesNear } from "@/lib/businesses";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

type UserResult = {
  user_id: number;
  username: string;
  display_name: string;
  bio: string | null;
  business_offering: string | null;
  is_verified: boolean;
};

function truncateOffering(text: string, max = 120) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function SearchVerifiedBadge() {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white"
      title="Verified on Deenly"
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">Verified</span>
    </span>
  );
}

type PostResult = {
  id: number;
  post_type: string;
  content: string;
  author_id: number;
  author_display_name: string;
};

type Mode = "search" | "near";

export default function SearchPage() {
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoPending, setGeoPending] = useState(false);

  useEffect(() => {
    if (mode !== "near") return;
    setGeoPending(true);
    setGeoError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Location is not available in this browser.");
      setGeoPending(false);
      setGeo({ lat: 40.7128, lng: -74.006 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoPending(false);
      },
      () => {
        setGeoError("Location denied — showing sample area (New York). Enable location for true Near me.");
        setGeo({ lat: 40.7128, lng: -74.006 });
        setGeoPending(false);
      },
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 12_000 }
    );
  }, [mode]);

  const nearQuery = useQuery({
    queryKey: ["businesses-near", geo?.lat, geo?.lng],
    queryFn: () => fetchBusinessesNear({ lat: geo!.lat, lng: geo!.lng, radiusM: 25_000, limit: 50 }),
    enabled: mode === "near" && Boolean(geo)
  });

  const usersQuery = useQuery({
    queryKey: ["search-users", submittedQuery],
    queryFn: () =>
      apiRequest<{ items: UserResult[] }>(`/search/users?q=${encodeURIComponent(submittedQuery)}&limit=10`, {
        auth: true
      }),
    enabled: mode === "search" && submittedQuery.length > 0
  });

  const postsQuery = useQuery({
    queryKey: ["search-posts", submittedQuery],
    queryFn: () =>
      apiRequest<{ items: PostResult[] }>(`/search/posts?q=${encodeURIComponent(submittedQuery)}&limit=10`, {
        auth: true
      }),
    enabled: mode === "search" && submittedQuery.length > 0
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedQuery(query.trim());
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-pill border px-4 py-2 text-sm font-semibold transition ${
            mode === "search" ? "border-text bg-text text-background" : "border-black/15 text-muted hover:bg-black/[0.04]"
          }`}
          onClick={() => setMode("search")}
        >
          Search
        </button>
        <button
          type="button"
          className={`rounded-pill border px-4 py-2 text-sm font-semibold transition ${
            mode === "near" ? "border-text bg-text text-background" : "border-black/15 text-muted hover:bg-black/[0.04]"
          }`}
          onClick={() => setMode("near")}
        >
          Near me
        </button>
        <Link
          href="/businesses/new"
          className="ml-auto rounded-pill border border-black/15 px-4 py-2 text-sm font-semibold text-text hover:bg-black/[0.04]"
        >
          Add business
        </Link>
      </div>

      {mode === "search" ? (
        <>
          <form className="surface-card flex gap-3" onSubmit={onSubmit}>
            <input
              className="input flex-1"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users or posts..."
              aria-label="Search users or posts"
            />
            <button className="btn-primary" type="submit">
              Search
            </button>
          </form>

          {!submittedQuery ? (
            <EmptyState title="Search the platform" subtitle="Find users and beneficial posts." />
          ) : null}
          {usersQuery.isLoading || postsQuery.isLoading ? <LoadingState label="Searching..." /> : null}
          {usersQuery.error ? <ErrorState message={(usersQuery.error as Error).message} /> : null}
          {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}

          {submittedQuery && !usersQuery.isLoading && !postsQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="surface-card space-y-3">
                <h2 className="text-lg font-semibold">Users</h2>
                {(usersQuery.data?.items || []).map((user) => (
                  <Link
                    key={user.user_id}
                    href={`/users/${user.user_id}`}
                    className="block rounded-lg border border-black/10 bg-surface/30 p-3 hover:border-black/25"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{user.display_name}</p>
                      {user.is_verified ? <SearchVerifiedBadge /> : null}
                    </div>
                    <p className="text-sm text-muted">@{user.username}</p>
                    {user.business_offering ? (
                      <p className="mt-2 line-clamp-2 text-xs text-text/80">{truncateOffering(user.business_offering)}</p>
                    ) : null}
                    {user.bio ? <p className="mt-2 line-clamp-2 text-xs text-muted">{user.bio}</p> : null}
                  </Link>
                ))}
                {(usersQuery.data?.items || []).length === 0 ? <EmptyState title="No users found" /> : null}
              </div>
              <div className="surface-card space-y-3">
                <h2 className="text-lg font-semibold">Posts</h2>
                {(postsQuery.data?.items || []).map((post) => (
                  <Link
                    key={post.id}
                    href={`/posts/${post.id}`}
                    className="block rounded-lg border border-black/10 bg-surface/30 p-3 hover:border-black/25"
                  >
                    <p className="text-xs uppercase text-muted">{post.post_type}</p>
                    <p className="font-medium">{post.content}</p>
                    <p className="text-sm text-muted">by {post.author_display_name}</p>
                  </Link>
                ))}
                {(postsQuery.data?.items || []).length === 0 ? <EmptyState title="No posts found" /> : null}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="space-y-3">
          {geoError ? <p className="text-sm text-amber-800">{geoError}</p> : null}
          {geoPending ? <LoadingState label="Finding your area…" /> : null}
          {!geoPending && geo ? (
            <>
              <div className="surface-card overflow-hidden rounded-panel border border-black/10">
                <div className="aspect-[16/10] w-full bg-muted/20">
                  <iframe
                    title="Map preview"
                    className="h-full w-full border-0"
                    loading="lazy"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${geo.lng - 0.06}%2C${geo.lat - 0.04}%2C${geo.lng + 0.06}%2C${geo.lat + 0.04}&layer=mapnik&marker=${geo.lat}%2C${geo.lng}`}
                  />
                </div>
                <p className="border-t border-black/10 p-2 text-center text-xs text-muted">
                  Preview map centered on your area. Open a listing for directions.
                </p>
              </div>
              {nearQuery.isLoading ? <LoadingState label="Loading nearby businesses…" /> : null}
              {nearQuery.error ? <ErrorState message={(nearQuery.error as Error).message} /> : null}
              <div className="surface-card space-y-2 rounded-panel border border-black/10 p-3">
                <h2 className="text-lg font-semibold">Nearby</h2>
                {(nearQuery.data?.items || []).length === 0 && !nearQuery.isLoading ? (
                  <EmptyState title="No businesses yet" subtitle="Be the first to add one." />
                ) : null}
                {(nearQuery.data?.items || []).map((biz) => (
                  <Link
                    key={biz.id}
                    href={`/businesses/${biz.id}`}
                    className="block rounded-lg border border-black/10 p-3 hover:bg-black/[0.03]"
                  >
                    <p className="font-medium">{biz.name}</p>
                    {typeof biz.distanceM === "number" ? (
                      <p className="text-xs text-muted">{(biz.distanceM / 1000).toFixed(1)} km away</p>
                    ) : null}
                    {biz.category ? <p className="text-xs text-muted">{biz.category}</p> : null}
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
