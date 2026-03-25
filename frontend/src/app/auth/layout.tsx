"use client";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="auth-root">
      <div className="auth-split">
        <aside className="auth-hero" aria-hidden>
          <div>
            <p className="auth-brand-title">DEENLY</p>
            <p className="auth-brand-subtitle">Social Media Platform For Muslims</p>
          </div>
          <div className="auth-phone-wrap">
            <div className="auth-phone">
              <div className="auth-phone-screen">
                <div className="auth-phone-bar" />
                <div className="auth-phone-media" />
              </div>
            </div>
          </div>
        </aside>
        <div className="auth-panel">{children}</div>
      </div>
    </section>
  );
}
