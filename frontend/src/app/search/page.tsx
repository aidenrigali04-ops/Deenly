"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { fetchBusinessesNear } from "@/lib/businesses";
import { fetchEventsNear } from "@/lib/events";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import type { NearMapSelection } from "@/components/near-me-map";

const NearMeMap = dynamic(() => import("@/components/near-me-map").then((m) => m.NearMeMap), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[280px] w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
      Loading map…
    </div>
  )
});

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
type NearType = "businesses" | "events" | "all";
type NearTimeWindow = "upcoming" | "today" | "this_week";

type EventCluster = {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  labels: string[];
};

function clusterNearbyEvents(
  items: Array<{ id: number; title: string; latitude: number | null; longitude: number | null }>,
  precision = 2
) {
  const map = new Map<string, EventCluster>();
  for (const item of items) {
    if (item.latitude == null || item.longitude == null) continue;
    const lat = Number(item.latitude.toFixed(precision));
    const lng = Number(item.longitude.toFixed(precision));
    const key = `${lat},${lng}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.labels.length < 3) {
        existing.labels.push(item.title);
      }
    } else {
      map.set(key, { id: key, latitude: lat, longitude: lng, count: 1, labels: [item.title] });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export default function SearchPage() {
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [nearType, setNearType] = useState<NearType>("all");
  const [nearTimeWindow, setNearTimeWindow] = useState<NearTimeWindow>("upcoming");
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [mapSelection, setMapSelection] = useState<NearMapSelection>(null);
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
  const nearEventsQuery = useQuery({
    queryKey: ["events-near", geo?.lat, geo?.lng, nearTimeWindow],
    queryFn: () =>
      fetchEventsNear({
        lat: geo!.lat,
        lng: geo!.lng,
        radiusM: 25_000,
        limit: 50,
        timeWindow: nearTimeWindow
      }),
    enabled: mode === "near" && Boolean(geo)
  });

  const usersQuery = useQuery({
    queryKey: ["search-users", submittedQuery],
    queryFn: () =>
      apiRequest<{ items: UserResult[] }>(`/search/users?q=${encodeURIComponent(submittedQuery)}&limit=10`),
    enabled: mode === "search" && submittedQuery.length > 0
  });

  const postsQuery = useQuery({
    queryKey: ["search-posts", submittedQuery],
    queryFn: () =>
      apiRequest<{ items: PostResult[] }>(`/search/posts?q=${encodeURIComponent(submittedQuery)}&limit=10`),
    enabled: mode === "search" && submittedQuery.length > 0
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedQuery(query.trim());
  };
  const eventClusters = clusterNearbyEvents(
    nearEventsQuery.data?.items || [],
    nearTimeWindow === "today" ? 2 : 1
  );
  const visibleEventItems =
    selectedCluster && nearType !== "businesses"
      ? (nearEventsQuery.data?.items || []).filter((event) => {
          if (event.latitude == null || event.longitude == null) return false;
          const key = `${Number(event.latitude.toFixed(nearTimeWindow === "today" ? 2 : 1))},${Number(
            event.longitude.toFixed(nearTimeWindow === "today" ? 2 : 1)
          )}`;
          return key === selectedCluster;
        })
      : nearEventsQuery.data?.items || [];

  const businessesForMap = nearType === "all" || nearType === "businesses" ? nearQuery.data?.items || [] : [];
  const eventsForMap = nearType === "all" || nearType === "events" ? visibleEventItems : [];

  useEffect(() => {
    setMapSelection(null);
  }, [nearType, nearTimeWindow, selectedCluster, geo?.lat, geo?.lng]);

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
            <EmptyState title="Search the platform" subtitle="Find people and posts." />
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
                <div className="relative aspect-[16/10] min-h-[280px] w-full bg-slate-100">
                  <div className="absolute inset-0 z-0 overflow-hidden rounded-t-xl">
                    <NearMeMap
                      center={geo}
                      businesses={businessesForMap}
                      events={eventsForMap}
                      onSelect={setMapSelection}
                    />
                  </div>
                  {mapSelection ? (
                    <div className="absolute bottom-0 left-0 right-0 z-[800] border-t border-black/10 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {mapSelection.kind === "business" ? (
                            <>
                              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Business</p>
                              <p className="truncate font-semibold text-text">{mapSelection.item.name}</p>
                              {mapSelection.item.category ? (
                                <p className="text-xs text-muted">{mapSelection.item.category}</p>
                              ) : null}
                              {typeof mapSelection.item.distanceM === "number" ? (
                                <p className="mt-1 text-xs text-muted">
                                  {(mapSelection.item.distanceM / 1000).toFixed(1)} km away
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Event</p>
                              <p className="line-clamp-2 font-semibold text-text">{mapSelection.item.title}</p>
                              <p className="text-xs text-muted">
                                {new Date(mapSelection.item.startsAt).toLocaleString()}
                              </p>
                              {typeof mapSelection.item.distanceM === "number" ? (
                                <p className="mt-1 text-xs text-muted">
                                  {(mapSelection.item.distanceM / 1000).toFixed(1)} km away
                                </p>
                              ) : null}
                            </>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <Link
                            href={
                              mapSelection.kind === "business"
                                ? `/businesses/${mapSelection.item.id}`
                                : `/events/${mapSelection.item.id}`
                            }
                            className="btn-primary whitespace-nowrap px-3 py-1.5 text-xs"
                          >
                            Open
                          </Link>
                          <button
                            type="button"
                            className="text-xs font-medium text-muted underline-offset-2 hover:text-text hover:underline"
                            onClick={() => setMapSelection(null)}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/10 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block size-2.5 shrink-0 rounded-full border-2 border-white bg-[#1a73e8] shadow-sm" />
                      You
                    </span>
                    {(nearType === "all" || nearType === "businesses") && businessesForMap.length > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block size-2.5 shrink-0 rounded-full border-2 border-white bg-teal-600 shadow-sm" />
                        Business
                      </span>
                    ) : null}
                    {(nearType === "all" || nearType === "events") && eventsForMap.length > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block size-2.5 shrink-0 rounded-full border-2 border-white bg-violet-600 shadow-sm" />
                        Event
                      </span>
                    ) : null}
                  </div>
                  <p className="text-center text-xs text-muted sm:text-right">
                    Tap a pin for details · scroll or pinch to move the map
                  </p>
                </div>
              </div>
              {nearQuery.isLoading ? <LoadingState label="Loading nearby businesses…" /> : null}
              {nearQuery.error ? <ErrorState message={(nearQuery.error as Error).message} /> : null}
              {nearEventsQuery.isLoading ? <LoadingState label="Loading nearby events…" /> : null}
              {nearEventsQuery.error ? <ErrorState message={(nearEventsQuery.error as Error).message} /> : null}
              <div className="flex flex-wrap gap-2">
                {(["all", "businesses", "events"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition ${
                      nearType === type ? "border-text bg-text text-background" : "border-black/15 text-muted hover:bg-black/[0.04]"
                    }`}
                    onClick={() => setNearType(type)}
                  >
                    {type === "all" ? "All" : type === "businesses" ? "Businesses" : "Events"}
                  </button>
                ))}
              </div>
              {(nearType === "all" || nearType === "events") ? (
                <div className="flex flex-wrap gap-2">
                  {(["upcoming", "today", "this_week"] as const).map((windowKey) => (
                    <button
                      key={windowKey}
                      type="button"
                      className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition ${
                        nearTimeWindow === windowKey
                          ? "border-text bg-text text-background"
                          : "border-black/15 text-muted hover:bg-black/[0.04]"
                      }`}
                      onClick={() => setNearTimeWindow(windowKey)}
                    >
                      {windowKey === "upcoming" ? "Upcoming" : windowKey === "today" ? "Today" : "This week"}
                    </button>
                  ))}
                </div>
              ) : null}
              {(nearType === "all" || nearType === "events") && eventClusters.length > 0 ? (
                <div className="surface-card space-y-2 rounded-panel border border-black/10 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Event density clusters</h3>
                    {selectedCluster ? (
                      <button
                        type="button"
                        className="text-xs text-sky-600 hover:underline"
                        onClick={() => setSelectedCluster(null)}
                      >
                        Clear cluster
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {eventClusters.map((cluster) => (
                      <button
                        key={cluster.id}
                        type="button"
                        className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition ${
                          selectedCluster === cluster.id
                            ? "border-text bg-text text-background"
                            : "border-black/15 text-muted hover:bg-black/[0.04]"
                        }`}
                        onClick={() => setSelectedCluster(cluster.id)}
                      >
                        {cluster.count} events near {cluster.latitude.toFixed(2)}, {cluster.longitude.toFixed(2)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="surface-card space-y-2 rounded-panel border border-black/10 p-3">
                <h2 className="text-lg font-semibold">Nearby</h2>
                {(nearQuery.data?.items || []).length === 0 &&
                (nearEventsQuery.data?.items || []).length === 0 &&
                !nearQuery.isLoading &&
                !nearEventsQuery.isLoading ? (
                  <EmptyState title="No businesses yet" subtitle="Be the first to add one." />
                ) : null}
                {(nearType === "all" || nearType === "businesses"
                  ? nearQuery.data?.items || []
                  : []
                ).map((biz) => (
                  <Link key={`biz-${biz.id}`} href={`/businesses/${biz.id}`} className="block rounded-lg border border-black/10 p-3 hover:bg-black/[0.03]">
                    <p className="font-medium">{biz.name}</p>
                    <p className="text-xs uppercase tracking-wide text-muted">Business</p>
                    {typeof biz.distanceM === "number" ? <p className="text-xs text-muted">{(biz.distanceM / 1000).toFixed(1)} km away</p> : null}
                    {biz.category ? <p className="text-xs text-muted">{biz.category}</p> : null}
                  </Link>
                ))}
                {(nearType === "all" || nearType === "events" ? visibleEventItems : []).map((event) => (
                  <Link
                    key={`event-${event.id}`}
                    href={`/events/${event.id}`}
                    className="block rounded-lg border border-black/10 p-3 hover:bg-black/[0.03]"
                  >
                    <p className="font-medium">{event.title}</p>
                    <p className="text-xs uppercase tracking-wide text-muted">Event</p>
                    <p className="text-xs text-muted">{new Date(event.startsAt).toLocaleString()}</p>
                    {typeof event.distanceM === "number" ? (
                      <p className="text-xs text-muted">{(event.distanceM / 1000).toFixed(1)} km away</p>
                    ) : null}
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
