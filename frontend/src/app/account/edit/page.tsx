"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSessionMe } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/states";

type AccountProfile = {
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  business_offering: string | null;
  website_url: string | null;
  show_business_on_profile?: boolean;
};

export default function AccountEditProfilePage() {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [businessOffering, setBusinessOffering] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [showBusinessOnProfile, setShowBusinessOnProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const sessionQuery = useQuery({
    queryKey: ["account-edit-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const profileQuery = useQuery({
    queryKey: ["account-profile-me"],
    queryFn: () => apiRequest<AccountProfile>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });

  useEffect(() => {
    if (profileQuery.data) {
      setDisplayName(profileQuery.data.display_name);
      setBio(profileQuery.data.bio || "");
      setBusinessOffering(profileQuery.data.business_offering || "");
      setWebsiteUrl(profileQuery.data.website_url || "");
      setShowBusinessOnProfile(Boolean(profileQuery.data.show_business_on_profile));
    }
  }, [profileQuery.data]);

  if (sessionQuery.isLoading || profileQuery.isLoading) {
    return <LoadingState label="Loading..." />;
  }
  if (sessionQuery.error || !sessionQuery.data) {
    return <ErrorState message="Sign in to edit your profile." />;
  }
  if (profileQuery.error || !profileQuery.data) {
    return <ErrorState message={(profileQuery.error as Error)?.message || "Unable to load profile."} />;
  }

  const profile = profileQuery.data;

  return (
    <div className="page-stack mx-auto w-full max-w-lg">
      <header className="page-header">
        <p className="text-sm text-muted">
          <Link
            href="/account"
            className="rounded-sm text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to profile
          </Link>
        </p>
        <h1 className="page-header-title mt-4 text-xl sm:text-2xl">Edit profile</h1>
        <p className="page-header-subtitle text-xs sm:text-sm">
          How your name, bio, and business details appear on Deenly.
        </p>
      </header>
      <div className="surface-card px-6 py-6">
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              setMessage("");
              try {
                const dn = displayName.trim();
                if (dn.length < 2) {
                  throw new Error("Display name must be at least 2 characters.");
                }
                await apiRequest("/users/me", {
                  method: "PUT",
                  auth: true,
                  body: {
                    displayName: dn,
                    bio: bio.trim() || null,
                    avatarUrl: profile.avatar_url ?? null,
                    businessOffering: businessOffering.trim() || null,
                    websiteUrl: websiteUrl.trim() || null
                  }
                });
                await apiRequest("/users/me/preferences", {
                  method: "PATCH",
                  auth: true,
                  body: { showBusinessOnProfile }
                });
                await queryClient.invalidateQueries({ queryKey: ["account-profile-me"] });
                setMessage("Saved.");
              } catch (err) {
                setMessage((err as Error).message || "Unable to save.");
              } finally {
                setSaving(false);
              }
            }}
          >
            <label className="space-y-1 text-sm">
              <span className="text-muted">Display name</span>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={64}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Bio</span>
              <textarea className="input min-h-24" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={240} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Your business, product, or service</span>
              <textarea
                className="input min-h-24"
                value={businessOffering}
                onChange={(e) => setBusinessOffering(e.target.value)}
                maxLength={2000}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Website</span>
              <input
                className="input"
                type="text"
                inputMode="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                maxLength={2048}
                placeholder="https://"
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={showBusinessOnProfile}
                onChange={(e) => setShowBusinessOnProfile(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium text-text">Show business details on my public profile</span>
                <span className="mt-0.5 block text-xs text-muted">
                  When off, visitors only see your name and bio; offering and website stay private.
                </span>
              </span>
            </label>
            {message ? <p className="text-xs text-muted">{message}</p> : null}
            <button type="submit" className="btn-primary w-fit" disabled={saving}>
              {saving ? "Saving..." : "Save profile"}
            </button>
          </form>
      </div>
    </div>
  );
}
