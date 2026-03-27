"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/states";

const interestOptions = [
  { key: "recitation", label: "Recitation" },
  { key: "post", label: "Posts & reminders" },
  { key: "marketplace", label: "Marketplace & offers" }
];

const intentOptions = [
  { key: "community", label: "Community & reflection" },
  { key: "shop", label: "Shop marketplace offers" },
  { key: "sell", label: "Sell or promote as a creator" },
  { key: "b2b", label: "Discover B2B-style opportunities" }
];

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
      setDefaultFeedTab(meQuery.data.default_feed_tab);
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
      await apiRequest("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: {
          onboardingIntents: intents,
          defaultFeedTab: defaultFeedTab || null,
          appLanding: appLanding || null
        }
      });
    },
    onSuccess: async () => {
      setMessage("Preferences saved.");
      await queryClient.invalidateQueries({ queryKey: ["my-interests"] });
      await queryClient.invalidateQueries({ queryKey: ["account-profile-me"] });
    },
    onError: (err: Error) => {
      setMessage(err.message || "Could not save.");
    }
  });

  if (interestsQuery.isLoading || meQuery.isLoading) {
    return <LoadingState label="Loading preferences..." />;
  }
  if (interestsQuery.error || meQuery.error) {
    return <ErrorState message="Could not load preferences. Sign in and try again." />;
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
          {interestOptions.map((option) => (
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
            {intentOptions.map((option) => (
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
              <option value="for_you">For You</option>
              <option value="opportunities">Opportunities</option>
              <option value="marketplace">Marketplace</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Open app to</span>
            <select className="input" value={appLanding} onChange={(e) => setAppLanding(e.target.value)}>
              <option value="home">Home</option>
              <option value="marketplace">Marketplace feed</option>
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
