"use client";

import { useEffect } from "react";
import { captureException } from "@/lib/sentry-browser";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <div className="container-shell flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-text">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted">Try again. If this keeps happening, contact support from the app.</p>
      <button type="button" className="btn-primary w-fit" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
