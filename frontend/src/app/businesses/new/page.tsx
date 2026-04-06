"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ApiError, apiRequest } from "@/lib/api";
import { assistPostText } from "@/lib/ai-assist";
import { createBusiness } from "@/lib/businesses";
import { ErrorState } from "@/components/states";

function buildBusinessAssistDraft(
  name: string,
  description: string,
  category: string,
  addressDisplay: string,
  websiteUrl: string
) {
  const parts = [`Name: ${name.trim()}`];
  if (category.trim()) {
    parts.push(`Category: ${category.trim()}`);
  }
  if (addressDisplay.trim()) {
    parts.push(`Address: ${addressDisplay.trim()}`);
  }
  if (websiteUrl.trim()) {
    parts.push(`Website: ${websiteUrl.trim()}`);
  }
  if (description.trim()) {
    parts.push(`What we offer (notes): ${description.trim()}`);
  }
  return parts.join("\n");
}

function buildBusinessOffering(
  name: string,
  description: string,
  category: string,
  addressDisplay: string
): string {
  const n = name.trim();
  const d = description.trim();
  const c = category.trim();
  const a = addressDisplay.trim();
  let line = d ? `${n} — ${d}` : n;
  if (c) line = `${c}: ${line}`;
  if (a) line = `${line}\n${a}`;
  return line.slice(0, 2000);
}

export default function NewBusinessPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<"profile" | "map">("profile");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [addressDisplay, setAddressDisplay] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  const assistMutation = useMutation({
    mutationFn: async () => {
      const draft = buildBusinessAssistDraft(name, description, category, addressDisplay, websiteUrl);
      const res = await assistPostText(draft, "business_listing");
      return res.suggestion;
    },
    onSuccess: (suggestion) => {
      setDescription(suggestion);
    }
  });

  const canPolishDescription =
    name.trim().length >= 2 && (description.trim().length >= 3 || category.trim().length >= 1);

  const profileMutation = useMutation({
    mutationFn: async () => {
      const offering = buildBusinessOffering(name, description, category, addressDisplay);
      await apiRequest("/users/me", {
        method: "PUT",
        auth: true,
        body: {
          businessOffering: offering,
          websiteUrl: websiteUrl.trim() || null
        }
      });
      await apiRequest("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: { showBusinessOnProfile: true }
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["account-session-me"] });
      await queryClient.invalidateQueries({ queryKey: ["account-profile-me"] });
      setPhase("map");
    }
  });

  const mapMutation = useMutation({
    mutationFn: () =>
      createBusiness({
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        addressDisplay: addressDisplay.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
        latitude: latitude!,
        longitude: longitude!,
        visibility: "published"
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["account-session-me"] });
      await queryClient.invalidateQueries({ queryKey: ["account-profile-me"] });
      router.push(`/businesses/${data.id}`);
    }
  });

  function useMyLocation() {
    setLocating(true);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 }
    );
  }

  const profileError = profileMutation.error;
  const mapError = mapMutation.error;
  const canAddProfile = name.trim().length >= 2 && !profileMutation.isPending;
  const canPublishMap =
    name.trim().length >= 2 && latitude != null && longitude != null && !mapMutation.isPending;

  return (
    <section className="mx-auto max-w-lg space-y-4">
      <div>
        <Link href="/search" className="text-sm text-muted hover:underline">
          Back to Search
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Add your business</h1>
        <p className="mt-1 text-sm text-muted">
          {phase === "profile"
            ? "Step 1: Save to your profile for search (name required). Map listing is step 2 and optional."
            : "Step 2 (optional): Add a map pin for Near me, or skip and keep your profile-only listing."}
        </p>
      </div>
      <div className="surface-card space-y-3 rounded-panel border border-black/10 p-4">
        {phase === "map" ? (
          <div className="rounded-control border border-black/10 bg-black/[0.03] p-3 text-sm font-medium text-text">
            Profile updated. Publish on the map below, or skip.
          </div>
        ) : null}

        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Name
          <input
            className="input mt-1 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={phase === "map"}
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Description
          <textarea
            className="input mt-1 min-h-24 w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={phase === "map"}
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Category
          <input
            className="input mt-1 w-full"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={phase === "map"}
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Address (display)
          <input
            className="input mt-1 w-full"
            value={addressDisplay}
            onChange={(e) => setAddressDisplay(e.target.value)}
            disabled={phase === "map"}
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Website (optional)
          <input
            className="input mt-1 w-full"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            disabled={phase === "map"}
          />
        </label>

        {phase === "profile" ? (
          <>
            {profileError ? <ErrorState message={(profileError as Error).message} /> : null}
            <button
              type="button"
              className="btn-secondary w-full text-sm"
              disabled={!canPolishDescription || assistMutation.isPending}
              onClick={() => assistMutation.mutate()}
            >
              {assistMutation.isPending ? "Polishing…" : "Polish description"}
            </button>
            {assistMutation.error ? (
              <p className="text-sm text-rose-700">
                {assistMutation.error instanceof ApiError
                  ? assistMutation.error.message
                  : "Could not polish. Try again."}
              </p>
            ) : null}
            <p className="text-xs text-muted">
              Uses your name, category, address, and notes—edit the result before saving.
            </p>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!canAddProfile}
              onClick={() => profileMutation.mutate()}
            >
              {profileMutation.isPending ? "Saving…" : "Add to profile"}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Map pin</p>
            <button type="button" className="btn-secondary w-full text-sm" onClick={useMyLocation} disabled={locating}>
              {locating ? "Getting location…" : "Use my current location"}
            </button>
            {latitude != null && longitude != null ? (
              <p className="text-xs text-muted">
                Pin: {latitude.toFixed(5)}, {longitude.toFixed(5)}
              </p>
            ) : (
              <p className="text-xs text-red-600">Set your location to publish on the map.</p>
            )}
            {mapError ? <ErrorState message={(mapError as Error).message} /> : null}
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!canPublishMap}
              onClick={() => mapMutation.mutate()}
            >
              {mapMutation.isPending ? "Publishing…" : "Publish on map"}
            </button>
            <Link
              href="/account"
              className="block w-full py-2 text-center text-sm font-semibold text-muted underline-offset-2 hover:underline"
            >
              Skip — stay profile only
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
