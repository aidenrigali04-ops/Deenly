"use client";

import { useReferralCodePreviewQuery } from "@/hooks/use-referral-code-preview";

type Props = {
  /** Raw referral code from the signup URL (already trimmed by parent when non-empty). */
  code: string;
};

function StatusDot({ tone }: { tone: "ok" | "warn" | "muted" }) {
  const map = {
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
    muted: "bg-black/25"
  } as const;
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-pill ${map[tone]}`} aria-hidden />;
}

export function ReferralSignupCallout({ code }: Props) {
  const preview = useReferralCodePreviewQuery(code);

  if (preview.isLoading || preview.isFetching) {
    return (
      <div
        className="mb-6 rounded-panel border border-black/10 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="skeleton mb-2 h-3 w-24 rounded-pill" />
        <div className="skeleton h-4 w-full max-w-[280px]" />
      </div>
    );
  }

  if (preview.isError) {
    return (
      <div
        className="mb-6 rounded-panel border border-black/10 bg-surface px-4 py-3.5 text-left shadow-sm"
        role="status"
      >
        <div className="flex items-start gap-2.5">
          <StatusDot tone="muted" />
          <div>
            <p className="text-sm font-medium text-text">Invite link</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              We could not verify this invite right now. You can still create your account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const data = preview.data;
  if (!data) {
    return null;
  }

  if (data.valid && data.exhausted) {
    return (
      <div
        className="mb-6 rounded-panel border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white px-4 py-3.5 text-left shadow-sm"
        role="status"
      >
        <div className="flex items-start gap-2.5">
          <StatusDot tone="warn" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">Invite code</p>
            <p className="mt-0.5 font-mono text-sm text-muted">{code}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              This invite has reached its limit. You can still sign up; rewards may not apply from this link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (data.valid) {
    return (
      <div
        className="mb-6 rounded-panel border border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 via-white to-sky-50/40 px-4 py-3.5 text-left shadow-sm"
        role="status"
      >
        <div className="flex items-start gap-2.5">
          <StatusDot tone="ok" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">You have an invite</p>
            <p className="mt-1 font-mono text-sm tracking-wide text-text">{code}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Finish signing up to connect your account with this referral, subject to program rules.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mb-6 rounded-panel border border-black/10 bg-surface px-4 py-3.5 text-left shadow-sm"
      role="status"
    >
      <div className="flex items-start gap-2.5">
        <StatusDot tone="muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text">Invite link</p>
          <p className="mt-0.5 font-mono text-sm text-muted">{code}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            We could not verify this invite code. You can still create your account.
          </p>
        </div>
      </div>
    </div>
  );
}
