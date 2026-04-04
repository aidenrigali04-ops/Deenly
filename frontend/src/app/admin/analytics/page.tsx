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

type ExperimentsDashboard = {
  windowDays: number;
  items: Array<{
    experimentId: string;
    variantId: string;
    totalEvents: number;
    attachRate: number;
    quickActionCtr: number;
    taskCompleted: number;
    resumeFlowClicked: number;
  }>;
};

type RolloutStatusDashboard = {
  stage: string;
  cohortPercent: number;
  metrics: {
    checkoutConversionRate: number;
    quickActionCtr: number;
    openReports: number;
  };
  thresholds: {
    checkoutConversionMin: number;
    quickActionCtrMin: number;
    openReportsMax: number;
  };
  guardrails: {
    checkoutConversionOk: boolean;
    quickActionCtrOk: boolean;
    reportsOk: boolean;
  };
  rollbackRecommended: boolean;
};

type RolloutRunbook = {
  stage: string;
  cohortPercent: number;
  guardrailBreaches: string[];
  rollbackRecommended: boolean;
  recommendedNextStage: string;
  runbook: string[];
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
  const experiments = useQuery({
    queryKey: ["analytics-experiments"],
    queryFn: () => apiRequest<ExperimentsDashboard>("/analytics/dashboard/experiments", { auth: true })
  });
  const rolloutStatus = useQuery({
    queryKey: ["analytics-rollout-status"],
    queryFn: () => apiRequest<RolloutStatusDashboard>("/analytics/dashboard/rollout-status", { auth: true })
  });
  const rolloutRunbook = useQuery({
    queryKey: ["analytics-rollout-runbook"],
    queryFn: () => apiRequest<RolloutRunbook>("/analytics/dashboard/rollout-runbook", { auth: true })
  });

  if (
    summary.isLoading ||
    funnel.isLoading ||
    retention.isLoading ||
    feedHealth.isLoading ||
    monetization.isLoading ||
    experiments.isLoading ||
    rolloutStatus.isLoading ||
    rolloutRunbook.isLoading
  ) {
    return <LoadingState label="Loading analytics dashboard..." />;
  }

  if (
    summary.error ||
    funnel.error ||
    retention.error ||
    feedHealth.error ||
    monetization.error ||
    experiments.error ||
    rolloutStatus.error ||
    rolloutRunbook.error
  ) {
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
      <div className="surface-card space-y-3">
        <h2 className="text-lg font-medium">Rollout Status (live guardrails)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card title="Stage" value={rolloutStatus.data?.stage || "read"} />
          <Card title="Cohort %" value={rolloutStatus.data?.cohortPercent || 0} />
          <Card
            title="Rollback"
            value={rolloutStatus.data?.rollbackRecommended ? "Recommended" : "Not needed"}
          />
        </div>
        <p className="text-xs text-muted">
          Checkout conv {((rolloutStatus.data?.metrics.checkoutConversionRate || 0) * 100).toFixed(1)}% (min{" "}
          {((rolloutStatus.data?.thresholds.checkoutConversionMin || 0) * 100).toFixed(1)}%), quick-action CTR{" "}
          {((rolloutStatus.data?.metrics.quickActionCtr || 0) * 100).toFixed(1)}% (min{" "}
          {((rolloutStatus.data?.thresholds.quickActionCtrMin || 0) * 100).toFixed(1)}%), open reports{" "}
          {rolloutStatus.data?.metrics.openReports || 0} (max {rolloutStatus.data?.thresholds.openReportsMax || 0}).
        </p>
      </div>
      <div className="surface-card space-y-3">
        <h2 className="text-lg font-medium">Rollback runbook</h2>
        <p className="text-xs text-muted">
          Recommended next stage: {rolloutRunbook.data?.recommendedNextStage || "read"} · rollback{" "}
          {rolloutRunbook.data?.rollbackRecommended ? "recommended" : "not required"}.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {(rolloutRunbook.data?.runbook || []).map((step, idx) => (
            <li key={`${idx}-${step}`}>{step}</li>
          ))}
        </ul>
      </div>
      <div className="surface-card">
        <h2 className="text-lg font-medium">Experiment outcomes (30 days)</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          {(experiments.data?.items || []).slice(0, 20).map((item) => (
            <li
              key={`${item.experimentId}-${item.variantId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 px-3 py-2"
            >
              <span>
                {item.experimentId} · {item.variantId}
              </span>
              <span>
                attach {((item.attachRate || 0) * 100).toFixed(1)}% · quick CTR{" "}
                {((item.quickActionCtr || 0) * 100).toFixed(1)}% · tasks {item.taskCompleted}
              </span>
            </li>
          ))}
        </ul>
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
