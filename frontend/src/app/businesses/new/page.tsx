"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBusiness } from "@/lib/businesses";
import { ErrorState } from "@/components/states";

export default function NewBusinessPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [addressDisplay, setAddressDisplay] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  const createMutation = useMutation({
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || latitude == null || longitude == null) return;
    createMutation.mutate();
  };

  return (
    <section className="mx-auto max-w-lg space-y-4">
      <div>
        <Link href="/search" className="text-sm text-muted hover:underline">
          Back to Search
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Add your business</h1>
        <p className="mt-1 text-sm text-muted">
          Name and location are required. Description and website are also saved to your profile for search. Published
          listings appear on Near me.
        </p>
      </div>
      <form onSubmit={onSubmit} className="surface-card space-y-3 rounded-panel border border-black/10 p-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Name
          <input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Description
          <textarea
            className="input mt-1 min-h-24 w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Category
          <input className="input mt-1 w-full" value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Address (display)
          <input className="input mt-1 w-full" value={addressDisplay} onChange={(e) => setAddressDisplay(e.target.value)} />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Website (optional)
          <input
            className="input mt-1 w-full"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
          />
        </label>
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
        {createMutation.error ? <ErrorState message={(createMutation.error as Error).message} /> : null}
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={!name.trim() || latitude == null || longitude == null || createMutation.isPending}
        >
          {createMutation.isPending ? "Saving…" : "Publish on map"}
        </button>
      </form>
    </section>
  );
}
