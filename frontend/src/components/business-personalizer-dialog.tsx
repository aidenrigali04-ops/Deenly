"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useSessionStore } from "@/store/session-store";
import { applyWebMeProfileAfterPreferencesPatch } from "@/lib/apply-me-profile-preferences-response";

type MeOnboarding = {
  business_onboarding_dismissed_at?: string | null;
};

const TOUR_SLIDES: { title: string; body: string }[] = [
  {
    title: "Home and Market",
    body: "Browse posts on Home and discover offers on Market. Use the main navigation anytime."
  },
  {
    title: "Create",
    body: "From Create you can post, list a product or membership, or add an event."
  },
  {
    title: "Search",
    body: "Find people, businesses, and events from Search."
  },
  {
    title: "Messages",
    body: "Message people you find in Search. Your inbox lists all conversations."
  },
  {
    title: "Profile and account type",
    body: "Account settings are under your profile. Switch to Professional or Business when you want creator or business tools—you can change this anytime."
  }
];

export function BusinessPersonalizerDialog() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const queryClient = useQueryClient();
  const [slideIndex, setSlideIndex] = useState(0);
  const [submitError, setSubmitError] = useState("");

  const meQuery = useQuery({
    queryKey: ["web-user-me-onboarding"],
    queryFn: () => apiRequest<MeOnboarding>("/users/me", { auth: true }),
    enabled: Boolean(user)
  });

  const completeMutation = useMutation({
    mutationFn: async (body: { navigateToOnboarding?: boolean }) => {
      const me = await apiRequest("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: {
          usagePersona: "personal",
          preferenceSource: "web_overlay"
        }
      });
      return { ...body, me };
    },
    onMutate: () => {
      setSubmitError("");
    },
    onSuccess: async (body) => {
      setSubmitError("");
      setSlideIndex(0);
      await applyWebMeProfileAfterPreferencesPatch(queryClient, body.me);
      if (body.navigateToOnboarding) {
        router.push("/onboarding");
      }
    },
    onError: (err: unknown) => {
      setSubmitError(err instanceof Error ? err.message : "Could not save. Please try again.");
    }
  });

  const visible = Boolean(user && meQuery.isSuccess && !meQuery.data?.business_onboarding_dismissed_at);
  if (!visible) {
    return null;
  }

  const last = slideIndex === TOUR_SLIDES.length - 1;
  const slide = TOUR_SLIDES[slideIndex];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-tour-title"
    >
      <div className="surface-card max-w-lg space-y-3 rounded-panel border border-black/10 p-5 shadow-soft">
        <h2 id="app-tour-title" className="text-lg font-semibold text-text">
          Welcome to Deenly
        </h2>
        <p className="text-xs font-semibold text-muted">
          {slideIndex + 1} of {TOUR_SLIDES.length}
        </p>
        <h3 className="text-base font-semibold text-text">{slide.title}</h3>
        <p className="text-sm text-muted leading-relaxed">{slide.body}</p>
        <div className="flex justify-center gap-1.5 py-1">
          {TOUR_SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full ${i === slideIndex ? "w-2 bg-text" : "w-1.5 bg-black/20"}`}
              aria-hidden
            />
          ))}
        </div>
        {submitError ? (
          <p className="rounded-control border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900" role="alert">
            {submitError}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {slideIndex > 0 ? (
            <button
              type="button"
              className="rounded-control border border-black/10 px-3 py-2 text-sm font-semibold text-text"
              disabled={completeMutation.isPending}
              onClick={() => setSlideIndex((i) => i - 1)}
            >
              Back
            </button>
          ) : (
            <span className="w-16" />
          )}
          {!last ? (
            <button
              type="button"
              className="btn-primary min-w-[120px] flex-1 sm:flex-none"
              disabled={completeMutation.isPending}
              onClick={() => setSlideIndex((i) => i + 1)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary min-w-[120px] flex-1 sm:flex-none"
              disabled={completeMutation.isPending}
              onClick={() => completeMutation.mutate({})}
            >
              {completeMutation.isPending ? "Saving…" : "Get started"}
            </button>
          )}
        </div>
        {last ? (
          <button
            type="button"
            className="w-full text-sm font-semibold text-sky-700 underline-offset-2 hover:underline"
            disabled={completeMutation.isPending}
            onClick={() => completeMutation.mutate({ navigateToOnboarding: true })}
          >
            Customize your feed
          </button>
        ) : null}
        <button
          type="button"
          className="w-full text-sm font-medium text-muted underline-offset-2 hover:underline"
          disabled={completeMutation.isPending}
          onClick={() => completeMutation.mutate({})}
        >
          Skip
        </button>
        <p className="text-xs text-muted">
          Map listing for a business? Add it from{" "}
          <Link href="/businesses/new" className="font-semibold text-sky-700 underline-offset-2 hover:underline">
            business profile
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
