"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/states";

type TotalsResponse = {
  days: number;
  totals: { event_name: string; total: number }[];
};

type Funnel = {
  signups: number;
  first_follows: number;
  first_posts: number;
  first_interactions: number;
};

type Retention = {
  cohort_size: number;
  d1_active: number;
  d7_active: number;
  d30_active: number;
};

type FeedHealth = {
  avg_completion_rate: number;
  avg_watch_time_ms: number;
  total_views: number;
};

type MonetizationDashboard = {
  windowDays: number;
  funnel: {
    checkoutStarted: number;
    purchasesCompletedEvents: number;
    checkoutConversionRate: number;
  };
  creatorFlow: {
    productDraftSaved: number;
    productPublished: number;
    tierDraftSaved: number;
    tierPublished: number;
  };
  economics: {
    ordersCompleted: number;
    gmvMinor: number;
    platformFeeMinor: number;
    creatorNetMinor: number;
  };
};

function Card({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="surface-card space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const summary = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: () => apiRequest<TotalsResponse>("/analytics/events/summary?days=30", { auth: true })
  });
  const funnel = useQuery({
    queryKey: ["analytics-funnel"],
    queryFn: () => apiRequest<Funnel>("/analytics/dashboard/funnel", { auth: true })
  });
  const retention = useQuery({
    queryKey: ["analytics-retention"],
    queryFn: () => apiRequest<Retention>("/analytics/dashboard/retention", { auth: true })
  });
  const feedHealth = useQuery({
    queryKey: ["analytics-feed-health"],
    queryFn: () => apiRequest<FeedHealth>("/analytics/dashboard/feed-health", { auth: true })
  });
  const monetization = useQuery({
    queryKey: ["analytics-monetization"],
    queryFn: () => apiRequest<MonetizationDashboard>("/analytics/dashboard/monetization", { auth: true })
  });

  if (summary.isLoading || funnel.isLoading || retention.isLoading || feedHealth.isLoading || monetization.isLoading) {
    return <LoadingState label="Loading analytics dashboard..." />;
  }

  if (summary.error || funnel.error || retention.error || feedHealth.error || monetization.error) {
    return <ErrorState message="Unable to load analytics dashboard." />;
  }

  return (
    <section className="space-y-4">
      <h1 className="section-title">Analytics Dashboard</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Signups" value={funnel.data?.signups ?? 0} />
        <Card title="First Follows" value={funnel.data?.first_follows ?? 0} />
        <Card title="First Posts" value={funnel.data?.first_posts ?? 0} />
        <Card title="First Interactions" value={funnel.data?.first_interactions ?? 0} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card title="D1 Active" value={retention.data?.d1_active ?? 0} />
        <Card title="D7 Active" value={retention.data?.d7_active ?? 0} />
        <Card title="D30 Active" value={retention.data?.d30_active ?? 0} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card title="Avg Completion %" value={feedHealth.data?.avg_completion_rate ?? 0} />
        <Card title="Avg Watch Time (ms)" value={feedHealth.data?.avg_watch_time_ms ?? 0} />
        <Card title="Total Views" value={feedHealth.data?.total_views ?? 0} />
      </div>
      <div className="surface-card space-y-3">
        <h2 className="text-lg font-medium">Monetization Rollout Guardrails (30 days)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card title="Checkout Started" value={monetization.data?.funnel.checkoutStarted ?? 0} />
          <Card title="Purchases Completed" value={monetization.data?.funnel.purchasesCompletedEvents ?? 0} />
          <Card
            title="Checkout Conversion"
            value={`${(((monetization.data?.funnel.checkoutConversionRate || 0) * 100).toFixed(1))}%`}
          />
          <Card title="Orders Completed" value={monetization.data?.economics.ordersCompleted ?? 0} />
        </div>
        <p className="text-xs text-muted">
          Use this panel for staged rollouts (10% → 50% → 100%). Roll back if conversion dips or support/refund guardrails degrade.
        </p>
      </div>
      <div className="surface-card">
        <h2 className="text-lg font-medium">Event Summary (30 days)</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          {summary.data?.totals.map((event) => (
            <li key={event.event_name} className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2">
              <span>{event.event_name}</span>
              <span>{event.total}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
