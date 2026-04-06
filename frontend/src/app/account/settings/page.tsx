"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSessionMe } from "@/lib/auth";
import { deleteMyAccount, fetchAccountDataExport } from "@/lib/account-data";
import { apiRequest } from "@/lib/api";
import { clearTokens } from "@/lib/storage";
import { useSessionStore } from "@/store/session-store";
import { ErrorState, LoadingState } from "@/components/states";
import { USAGE_PERSONA_OPTIONS, type UsagePersonaKey } from "../../../../../shared/onboarding-options";
import { applyWebMeProfileAfterPreferencesPatch } from "@/lib/apply-me-profile-preferences-response";

type MeProfile = {
  likes_received_count: number;
  likes_given_count: number;
  profile_kind?: "consumer" | "professional" | "business_interest" | null;
  persona_capabilities?: {
    can_access_creator_hub?: boolean;
    can_create_products?: boolean;
    can_use_business_directory_tools?: boolean;
  };
};

export default function AccountSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setUser = useSessionStore((s) => s.setUser);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const sessionQuery = useQuery({
    queryKey: ["account-settings-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const profileQuery = useQuery({
    queryKey: ["account-profile-me"],
    queryFn: () => apiRequest<MeProfile>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const usagePersonaMutation = useMutation({
    mutationFn: (usagePersona: UsagePersonaKey) =>
      apiRequest<MeProfile>("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: { usagePersona, preferenceSource: "web_settings" }
      }),
    onSuccess: async (me) => {
      await applyWebMeProfileAfterPreferencesPatch(queryClient, me);
      await queryClient.invalidateQueries({ queryKey: ["account-settings-session-me"] });
    }
  });

  const exportMutation = useMutation({
    mutationFn: fetchAccountDataExport,
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deenly-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMyAccount,
    onSuccess: async () => {
      clearTokens();
      setUser(null);
      await queryClient.clear();
      router.replace("/");
    }
  });

  if (sessionQuery.isLoading) {
    return <LoadingState label="Loading..." />;
  }
  if (sessionQuery.error || !sessionQuery.data) {
    return <ErrorState message="Sign in to view settings." />;
  }

  const user = sessionQuery.data;
  const likes = profileQuery.data;
  const caps = likes?.persona_capabilities;
  const activePersona: UsagePersonaKey =
    likes?.profile_kind === "business_interest"
      ? "business"
      : likes?.profile_kind === "professional"
        ? "professional"
        : "personal";

  return (
    <div className="page-stack mx-auto w-full max-w-2xl">
      <header className="page-header">
        <p className="text-sm text-muted">
          <Link
            href="/account"
            className="rounded-sm text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to profile
          </Link>
        </p>
        <h1 className="page-header-title mt-4">Account</h1>
        <p className="page-header-subtitle">Preferences and account details for Deenly.</p>
      </header>

      <div className="section-stack">
        <div className="surface-card px-6 py-6">
          <h2 className="text-sm font-semibold text-text">Overview</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2 text-sm text-muted">
              Likes received:{" "}
              <span className="font-semibold text-text">{likes?.likes_received_count ?? "—"}</span>
            </div>
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2 text-sm text-muted">
              Likes by you: <span className="font-semibold text-text">{likes?.likes_given_count ?? "—"}</span>
            </div>
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2 sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted">Email</p>
              <p className="mt-1 font-medium text-text">{user.email}</p>
            </div>
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2 sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted">Username</p>
              <p className="mt-1 font-medium text-text">@{user.username || "unknown"}</p>
            </div>
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2 sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted">Role</p>
              <p className="mt-1 font-medium text-text">{user.role}</p>
            </div>
          </div>
        </div>

        <div className="surface-card px-6 py-6">
          <h2 className="text-sm font-semibold text-text">Data &amp; privacy</h2>
          <p className="mt-1 text-xs text-muted">
            <Link href="/privacy" className="text-sky-700 underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            {" · "}
            <Link href="/terms" className="text-sky-700 underline-offset-2 hover:underline">
              Terms
            </Link>
          </p>
          <div className="mt-4 space-y-3">
            <button
              type="button"
              className="btn-secondary w-full text-sm"
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
            >
              {exportMutation.isPending ? "Preparing export…" : "Download my data (JSON)"}
            </button>
            {exportMutation.error ? (
              <p className="text-xs text-rose-700">
                {exportMutation.error instanceof Error ? exportMutation.error.message : "Export failed."}
              </p>
            ) : null}
            {user.role !== "user" ? (
              <p className="text-xs text-muted">
                Staff accounts cannot be closed from the app. Contact operations to deactivate moderator or admin
                access.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted">
                  Closing your account anonymizes your profile and signs you out. Posts you published may remain with a
                  generic author label, per retention policy.
                </p>
                <label className="block text-xs font-semibold text-muted" htmlFor="delete-confirm">
                  Type DELETE to confirm account closure
                </label>
                <input
                  id="delete-confirm"
                  className="input w-full max-w-xs"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="rounded-control border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50"
                  disabled={deleteConfirm !== "DELETE" || deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                >
                  {deleteMutation.isPending ? "Closing…" : "Close my account"}
                </button>
                {deleteMutation.error ? (
                  <p className="text-xs text-rose-700">
                    {deleteMutation.error instanceof Error ? deleteMutation.error.message : "Could not close account."}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="surface-card px-6 py-6">
          <h2 className="text-sm font-semibold text-text">How you use Deenly</h2>
          <p className="mt-1 text-xs text-muted">Sets your default experience. You can change this anytime.</p>
          {usagePersonaMutation.error ? (
            <p className="mt-2 rounded-control border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              {usagePersonaMutation.error instanceof Error
                ? usagePersonaMutation.error.message
                : "Could not save settings right now. Please try again."}
            </p>
          ) : null}
          <div className="mt-3 grid gap-2">
            {USAGE_PERSONA_OPTIONS.map((option) => {
              const active = activePersona === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`rounded-control border px-3 py-2 text-left transition ${
                    active
                      ? "border-black bg-black/[0.03]"
                      : "border-black/10 bg-surface hover:bg-black/[0.02]"
                  }`}
                  disabled={usagePersonaMutation.isPending}
                  onClick={() => usagePersonaMutation.mutate(option.key)}
                >
                  <p className="text-sm font-semibold text-text">{option.label}</p>
                  <p className="mt-1 text-xs text-muted">{option.subtitle}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="surface-card overflow-hidden px-0 py-0">
          <div className="border-b border-black/10 px-6 py-4">
            <h2 className="text-sm font-semibold text-text">Navigate</h2>
            <p className="mt-1 text-xs text-muted">One tap per destination — same actions as before.</p>
          </div>
          <nav className="divide-y divide-black/10" aria-label="Account navigation">
            {(
              [
                { href: "/account/edit", label: "Edit profile", hint: "Name, bio, business details" },
                { href: "/account/purchases", label: "Purchases", hint: "Orders & access" },
                ...(caps?.can_access_creator_hub
                  ? [
                      {
                        href: "/account/creator",
                        label: activePersona === "business" ? "Creator hub" : "Pro tools",
                        hint:
                          activePersona === "business"
                            ? "Payouts, products, growth tools"
                            : "Services, payouts, and products"
                      }
                    ]
                  : []),
                ...(caps?.can_create_products
                  ? [{ href: "/create/product", label: "New listing", hint: "Create an offer without a post" }]
                  : []),
                ...(caps?.can_use_business_directory_tools
                  ? [{ href: "/businesses/new", label: "Business profile", hint: "Directory and map visibility" }]
                  : []),
                { href: "/onboarding", label: "Setup & feed", hint: "Interests & defaults" },
                { href: "/sessions", label: "Sessions", hint: "Signed-in devices" },
                { href: "/notifications", label: "Inbox", hint: "Notifications" }
              ] as const
            ).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col gap-0.5 px-6 py-3.5 transition hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black/20"
              >
                <span className="text-sm font-semibold text-text">{item.label}</span>
                <span className="text-xs text-muted">{item.hint}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
