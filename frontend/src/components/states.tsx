export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="surface-card text-sm text-muted" role="status" aria-live="polite">
      {label}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="surface-card space-y-3">
      <p className="text-sm text-rose-300">{message}</p>
      {onRetry ? (
        <button className="btn-secondary" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="surface-card">
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
    </div>
  );
}
