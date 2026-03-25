"use client";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="auth-root">
      <div className="auth-split">
        <aside className="auth-hero" aria-hidden>
          <div className="auth-hero-copy">
            <p className="auth-brand-title">DEENLY</p>
            <p className="auth-brand-subtitle">Social Media Platform For Muslims</p>
          </div>
          <div className="auth-phone-wrap">
            <div className="auth-phone">
              <div className="auth-phone-screen">
                <div className="auth-phone-status">
                  <span className="auth-chip">+</span>
                  <span className="auth-chip">oo</span>
                  <span className="auth-chip">UM</span>
                  <span className="auth-chip">SP</span>
                  <span className="auth-chip">MN</span>
                </div>
                <div className="auth-phone-divider" />
                <div className="auth-phone-meta">
                  <span className="auth-dot" />
                  <span className="auth-meta-line auth-meta-line-1" />
                  <span className="auth-meta-line auth-meta-line-2" />
                </div>
                <div className="auth-phone-media">
                  <div className="auth-phone-overlay" />
                  <div className="auth-book" />
                </div>
              </div>
            </div>
          </div>
        </aside>
        <div className="auth-panel">{children}</div>
      </div>
    </section>
  );
}
