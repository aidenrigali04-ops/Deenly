"use client";

/**
 * Root-level error UI when the root layout fails. Must define its own html/body (no App Router layout).
 */
export default function GlobalError({
  error: _error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, margin: 0, background: "#fafafa", color: "#111" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: "#555", marginBottom: 20, maxWidth: 420 }}>
          The app hit an unexpected error. You can try reloading this page.
        </p>
        <button
          type="button"
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer"
          }}
          onClick={() => reset()}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
