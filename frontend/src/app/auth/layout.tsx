"use client";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="auth-root">
      <div className="auth-split">
        <div className="auth-panel">{children}</div>
      </div>
    </section>
  );
}
