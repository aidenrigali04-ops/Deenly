"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { applyWebMeProfileAfterPreferencesPatch } from "@/lib/apply-me-profile-preferences-response";
import { ErrorState, LoadingState } from "@/components/states";
import {
  APP_LANDING_OPTIONS,
  FEED_TAB_OPTIONS,
  INTEREST_OPTIONS,
  INTENT_OPTIONS
} from "../../../../shared/onboarding-options";

type InterestsResponse = { items: string[] };

type MeProfile = {
  onboarding_intents?: string[] | null;
  default_feed_tab?: string | null;
  app_landing?: string | null;
};

export default function OnboardingPage() {
  const queryClient = useQueryClient();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [intents, setIntents] = useState<string[]>([]);
  const [defaultFeedTab, setDefaultFeedTab] = useState<string>("for_you");
  const [appLanding, setAppLanding] = useState<string>("home");
  const [message, setMessage] = useState("");

  const interestsQuery = useQuery({
    queryKey: ["my-interests"],
    queryFn: () => apiRequest<InterestsResponse>("/users/me/interests", { auth: true })
  });

  const meQuery = useQuery({
    queryKey: ["account-profile-me"],
    queryFn: () => apiRequest<MeProfile>("/users/me", { auth: true })
  });

  useEffect(() => {
    if (interestsQuery.data?.items?.length) {
      setSelectedInterests(interestsQuery.data.items);
    }
  }, [interestsQuery.data]);

  useEffect(() => {
    if (!meQuery.data) {
      return;
    }
    const oi = meQuery.data.onboarding_intents;
    if (oi && oi.length) {
      setIntents(oi);
    }
    if (meQuery.data.default_feed_tab) {
      const tab =
        meQuery.data.default_feed_tab === "opportunities" ? "for_you" : meQuery.data.default_feed_tab;
      setDefaultFeedTab(tab === "marketplace" || tab === "for_you" ? tab : "for_you");
    }
    if (meQuery.data.app_landing) {
      setAppLanding(meQuery.data.app_landing);
    }
  }, [meQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/users/me/interests", {
        method: "PUT",
        auth: true,
        body: { interests: selectedInterests }
      });
      return apiRequest("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: {
          onboardingIntents: intents,
          defaultFeedTab: defaultFeedTab || null,
          appLanding: appLanding || null,
          businessOnboardingDismissed: true,
          preferenceSource: "web_onboarding"
        }
      });
    },
    onSuccess: async (me) => {
      setMessage("Preferences saved.");
      await applyWebMeProfileAfterPreferencesPatch(queryClient, me);
      await queryClient.invalidateQueries({ queryKey: ["my-interests"] });
    },
    onError: (err: Error) => {
      setMessage(err.message || "Could not save.");
    }
  });

  if (interestsQuery.isLoading || meQuery.isLoading) {
    return <LoadingState label="Loading preferences..." />;
  }
  if (interestsQuery.error || meQuery.error) {
    return <ErrorState message="Could not load preferences. Check your connection and try again." />;
  }

  const activeInterests = selectedInterests.length ? selectedInterests : interestsQuery.data?.items || [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    saveMutation.mutate();
  };

  const toggleIntent = (key: string) => {
    setIntents((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, key];
    });
  };

  return (
    <section className="surface-card max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Your Deenly setup</h1>
        <p className="mt-2 text-sm text-muted">
          Tune feed ranking, how the app opens, and what you are here for. You can change this anytime in Account.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-8">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-text">Feed interests</h2>
          <p className="text-xs text-muted">Used to personalize ranking in For You.</p>
          {INTEREST_OPTIONS.map((option) => (
            <label key={option.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={activeInterests.includes(option.key)}
                onChange={(event) => {
                  if (event.target.checked) {
                    setSelectedInterests([...new Set([...activeInterests, option.key])]);
                  } else {
                    setSelectedInterests(activeInterests.filter((item) => item !== option.key));
                  }
                }}
              />
              {option.label}
            </label>
          ))}
        </div>

        <div className="space-y-3 border-t border-black/10 pt-6">
          <h2 className="text-sm font-semibold text-text">What brings you here? (optional, up to 3)</h2>
          <p className="text-xs text-muted">Helps us keep the experience focused—not a permanent account type.</p>
          <div className="flex flex-col gap-2">
            {INTENT_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={intents.includes(option.key)}
                  onChange={() => toggleIntent(option.key)}
                  disabled={!intents.includes(option.key) && intents.length >= 3}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 border-t border-black/10 pt-6 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted">Default tab on Home</span>
            <select
              className="input"
              value={defaultFeedTab}
              onChange={(e) => setDefaultFeedTab(e.target.value)}
            >
              {FEED_TAB_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Open app to</span>
            <select className="input" value={appLanding} onChange={(e) => setAppLanding(e.target.value)}>
              {APP_LANDING_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save preferences"}
        </button>
        {message ? <p className="text-sm text-accent">{message}</p> : null}
      </form>
    </section>
  );
}
