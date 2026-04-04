"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useSessionStore } from "@/store/session-store";
import { USAGE_PERSONA_OPTIONS, type UsagePersonaKey } from "../../../shared/onboarding-options";
import { applyWebMeProfileAfterPreferencesPatch } from "@/lib/apply-me-profile-preferences-response";

type MeOnboarding = {
  business_onboarding_dismissed_at?: string | null;
};

export function BusinessPersonalizerDialog() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const queryClient = useQueryClient();
  const [selectedPersona, setSelectedPersona] = useState<UsagePersonaKey>("personal");

  const meQuery = useQuery({
    queryKey: ["web-user-me-onboarding"],
    queryFn: () => apiRequest<MeOnboarding>("/users/me", { auth: true }),
    enabled: Boolean(user)
  });

  const completeMutation = useMutation({
    mutationFn: async (body: { usagePersona: UsagePersonaKey; navigate?: "creator" | "onboarding" }) => {
      const me = await apiRequest("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: {
          usagePersona: body.usagePersona,
          preferenceSource: "web_overlay"
        }
      });
      return { ...body, me };
    },
    onSuccess: async (body) => {
      await applyWebMeProfileAfterPreferencesPatch(queryClient, body.me);
      if (body.navigate === "creator") {
        router.push("/account/creator");
      } else if (body.navigate === "onboarding") {
        router.push("/onboarding");
      }
    }
  });

  const visible = Boolean(user && meQuery.isSuccess && !meQuery.data?.business_onboarding_dismissed_at);
  if (!visible) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="biz-personalizer-title"
    >
      <div className="surface-card max-w-lg space-y-3 rounded-panel border border-black/10 p-5 shadow-soft">
        <h2 id="biz-personalizer-title" className="text-lg font-semibold text-text">
          Personalize your experience
        </h2>
        <p className="text-sm text-muted">
          Choose what Deenly should optimize first. You can change this later in settings.
        </p>
        <div className="flex flex-col gap-2">
          {USAGE_PERSONA_OPTIONS.map((option) => {
            const active = selectedPersona === option.key;
            return (
              <button
                key={option.key}
                type="button"
                className={`rounded-control border px-3 py-2 text-left transition ${
                  active
                    ? "border-black bg-black/[0.03]"
                    : "border-black/10 bg-surface hover:bg-black/[0.02]"
                }`}
                disabled={completeMutation.isPending}
                onClick={() => setSelectedPersona(option.key)}
              >
                <p className="text-sm font-semibold text-text">{option.label}</p>
                <p className="mt-1 text-xs text-muted">{option.subtitle}</p>
              </button>
            );
          })}
          <button
            type="button"
            className="btn-primary w-full"
            disabled={completeMutation.isPending}
            onClick={() => {
              completeMutation.mutate({
                usagePersona: selectedPersona,
                navigate: selectedPersona === "business" ? "creator" : "onboarding"
              });
            }}
          >
            {completeMutation.isPending ? "Saving…" : "Continue"}
          </button>
          <button
            type="button"
            className="text-sm font-medium text-muted underline-offset-2 hover:underline"
            disabled={completeMutation.isPending}
            onClick={() => completeMutation.mutate({ usagePersona: "personal", navigate: "onboarding" })}
          >
            I&apos;ll decide later
          </button>
        </div>
        <p className="text-xs text-muted">
          Want a map listing too? Add it from <Link href="/businesses/new">business profile</Link>.
        </p>
      </div>
    </div>
  );
}
