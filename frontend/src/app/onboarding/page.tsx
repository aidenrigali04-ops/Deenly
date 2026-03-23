"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/states";

const interestOptions = [
  { key: "recitation", label: "Recitation" },
  { key: "community", label: "Community" },
  { key: "short_video", label: "Short Video Reminders" }
];

type InterestsResponse = { items: string[] };

export default function OnboardingPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const interestsQuery = useQuery({
    queryKey: ["my-interests"],
    queryFn: () => apiRequest<InterestsResponse>("/users/me/interests", { auth: true })
  });

  const saveMutation = useMutation({
    mutationFn: (interests: string[]) =>
      apiRequest<InterestsResponse>("/users/me/interests", {
        method: "PUT",
        auth: true,
        body: { interests }
      }),
    onSuccess: (data) => {
      setSelected(data.items);
      setMessage("Preferences saved.");
    }
  });

  if (interestsQuery.isLoading) return <LoadingState label="Loading interests..." />;
  if (interestsQuery.error) return <ErrorState message="Could not load interests." />;

  const active = selected.length ? selected : interestsQuery.data?.items || [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    saveMutation.mutate(active);
  };

  return (
    <section className="surface-card max-w-2xl">
      <h1 className="text-2xl font-semibold">Interest Setup</h1>
      <p className="mt-2 text-sm text-muted">
        Choose what you want to prioritize in your feed.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        {interestOptions.map((option) => (
          <label key={option.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active.includes(option.key)}
              onChange={(event) => {
                if (event.target.checked) {
                  setSelected([...new Set([...active, option.key])]);
                } else {
                  setSelected(active.filter((item) => item !== option.key));
                }
              }}
            />
            {option.label}
          </label>
        ))}
        <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save preferences"}
        </button>
      </form>
      {message ? <p className="mt-3 text-sm text-accent">{message}</p> : null}
    </section>
  );
}
