"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useSessionStore } from "@/store/session-store";

type MeOnboarding = {
  business_onboarding_dismissed_at?: string | null;
};

export function BusinessPersonalizerDialog() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["web-user-me-onboarding"],
    queryFn: () => apiRequest<MeOnboarding>("/users/me", { auth: true }),
    enabled: Boolean(user)
  });

  const completeMutation = useMutation({
    mutationFn: (body: {
      step: number;
      profileKind: "consumer" | "business_interest";
      navigate?: "businesses/new" | "creator";
    }) =>
      apiRequest("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: {
          businessOnboardingDismissed: true,
          businessOnboardingStep: body.step,
          profileKind: body.profileKind
        }
      }).then(() => body),
    onSuccess: async (body) => {
      await queryClient.invalidateQueries({ queryKey: ["web-user-me-onboarding"] });
      if (body.navigate === "businesses/new") {
        router.push("/businesses/new");
      } else if (body.navigate === "creator") {
        router.push("/account/creator");
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
      <div className="surface-card max-w-md space-y-3 rounded-panel border border-black/10 p-5 shadow-soft">
        <h2 id="biz-personalizer-title" className="text-lg font-semibold text-text">
          Personalize your experience
        </h2>
        <p className="text-sm text-muted">
          Add your business to your profile (and the map) when you&apos;re ready — or connect payments, or skip and
          stay personal.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="btn-primary w-full"
            disabled={completeMutation.isPending}
            onClick={() =>
              completeMutation.mutate({ step: 1, profileKind: "business_interest", navigate: "businesses/new" })
            }
          >
            Add business to profile
          </button>
          <button
            type="button"
            className="btn-secondary w-full"
            disabled={completeMutation.isPending}
            onClick={() =>
              completeMutation.mutate({ step: 2, profileKind: "business_interest", navigate: "creator" })
            }
          >
            Stripe &amp; selling
          </button>
          <button
            type="button"
            className="text-sm font-medium text-muted underline-offset-2 hover:underline"
            disabled={completeMutation.isPending}
            onClick={() => completeMutation.mutate({ step: 0, profileKind: "consumer" })}
          >
            {completeMutation.isPending ? "Saving…" : "Skip for now"}
          </button>
        </div>
        <p className="text-xs text-muted">
          Also from <Link href="/search">Search</Link> → Near me or <Link href="/account">Account</Link>.
        </p>
      </div>
    </div>
  );
}
