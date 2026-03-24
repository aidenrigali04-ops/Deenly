export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="surface-card space-y-3 text-sm text-muted" role="status" aria-live="polite">
      <p>{label}</p>
      <div className="space-y-2">
        <div className="skeleton h-3 w-1/3" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
      </div>
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
      <p className="text-sm font-medium text-rose-300">Something went wrong</p>
      <p className="text-sm text-muted">{message}</p>
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
    <div className="surface-card space-y-1">
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
    </div>
  );
}
