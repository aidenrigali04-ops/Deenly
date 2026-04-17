"use client";

import { Suspense, useMemo } from "react";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { fetchSessionMe, loginWithGoogle, signup } from "@/lib/auth";
import { ReferralSignupCallout } from "@/components/referral-signup-callout";
import { requestGoogleAccessToken } from "@/lib/google-oauth";
import { useSessionStore } from "@/store/session-store";

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useSessionStore((state) => state.setUser);
  const referralCode = useMemo(() => {
    const raw = searchParams.get("referralCode")?.trim();
    return raw && raw.length > 0 ? raw : null;
  }, [searchParams]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    businessOffering: "",
    websiteUrl: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [error, setError] = useState("");
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  const finalizeSession = async () => {
    const me = await fetchSessionMe();
    setUser(me);
    const next = searchParams.get("next") || "/home";
    router.push(next);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const displayName = `${form.firstName} ${form.lastName}`.trim() || form.username;
      await signup({
        email: form.email,
        username: form.username,
        password: form.password,
        displayName,
        businessOffering: form.businessOffering.trim() || null,
        websiteUrl: form.websiteUrl.trim() || null,
        referralCode: referralCode ?? undefined
      });
      await finalizeSession();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to create account";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onGoogleSignUp = async () => {
    setError("");
    setIsGoogleSubmitting(true);
    try {
      const accessToken = await requestGoogleAccessToken(googleClientId);
      await loginWithGoogle({ accessToken, referralCode: referralCode ?? undefined });
      await finalizeSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in with Google";
      setError(message);
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <section className="auth-panel-inner">
      <div>
        <h1 className="auth-heading">Create your account</h1>
        <p className="auth-subheading">Join Deenly in a minute. Email or Google.</p>
      </div>

      {referralCode ? <ReferralSignupCallout code={referralCode} /> : null}

      <button
        className="auth-google-btn"
        type="button"
        onClick={onGoogleSignUp}
        disabled={isGoogleSubmitting}
      >
        <svg width="18" height="18" viewBox="0 0 256 262" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path fill="#4285F4" d="M255.878 133.451c0-10.47-.936-20.53-2.677-30.187H130.55v57.147h70.067c-3.02 16.303-12.208 30.104-26.032 39.315v32.623h42.059c24.63-22.68 39.234-56.147 39.234-98.898z"/>
          <path fill="#34A853" d="M130.55 261.1c35.325 0 64.96-11.712 86.613-31.752l-42.06-32.623c-11.71 7.85-26.662 12.48-44.553 12.48-34.2 0-63.17-23.1-73.53-54.13H13.7v33.998C35.23 232.1 79.04 261.1 130.55 261.1z"/>
          <path fill="#FBBC05" d="M57.02 155.076a78.8 78.8 0 0 1-4.1-25.076c0-8.71 1.5-17.18 4.1-25.076V70.927H13.7a130.12 130.12 0 0 0 0 118.146l43.32-33.997z"/>
          <path fill="#EA4335" d="M130.55 50.795c19.21 0 36.47 6.6 50.04 19.56l37.53-37.53C195.46 11.72 165.87 0 130.55 0 79.04 0 35.23 29 13.7 70.927l43.32 33.997c10.36-31.03 39.33-54.13 73.53-54.13z"/>
        </svg>
        {isGoogleSubmitting ? "Connecting..." : "Continue with Google"}
      </button>

      <div className="auth-divider">Or</div>

      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="auth-grid-2">
          <div>
            <label className="auth-label" htmlFor="signup-first-name">
              First Name
            </label>
            <input
              id="signup-first-name"
              className="auth-input"
              type="text"
              placeholder="eg. John"
              value={form.firstName}
              onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
              required
            />
          </div>
          <div>
            <label className="auth-label" htmlFor="signup-last-name">
              Last Name
            </label>
            <input
              id="signup-last-name"
              className="auth-input"
              type="text"
              placeholder="eg. Francisco"
              value={form.lastName}
              onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
              required
            />
          </div>
        </div>

        <div>
          <label className="auth-label" htmlFor="signup-username">
            Username
          </label>
          <input
            id="signup-username"
            className="auth-input"
            type="text"
            placeholder="eg. deenly_user"
            value={form.username}
            onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
            required
          />
        </div>

        <div>
          <label className="auth-label" htmlFor="signup-email">
            Email
          </label>
          <input
            id="signup-email"
            className="auth-input"
            type="email"
            placeholder="eg. johnfrans@gmail.com"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            required
          />
        </div>

        <div>
          <label className="auth-label" htmlFor="signup-password">
            Password
          </label>
          <input
            id="signup-password"
            className="auth-input"
            type="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            required
          />
          <p className="auth-helper">Must be at least 8 characters.</p>
        </div>

        <div>
          <label className="auth-label" htmlFor="signup-business-offering">
            Your business, product, or service
          </label>
          <textarea
            id="signup-business-offering"
            className="auth-input min-h-[88px] resize-y py-2"
            placeholder="What do you offer? (optional)"
            value={form.businessOffering}
            onChange={(event) => setForm((prev) => ({ ...prev, businessOffering: event.target.value }))}
            maxLength={2000}
            rows={3}
          />
        </div>

        <div>
          <label className="auth-label" htmlFor="signup-website">
            Website
          </label>
          <input
            id="signup-website"
            className="auth-input"
            type="text"
            inputMode="url"
            placeholder="https://your-site.com (optional)"
            value={form.websiteUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, websiteUrl: event.target.value }))}
            maxLength={2048}
          />
        </div>

        {error ? <p className="auth-error">{error}</p> : null}

        <button disabled={isSubmitting} className="auth-submit">
          {isSubmitting ? "Creating Account..." : "Sign Up"}
        </button>
      </form>

      <p className="auth-footer">
        Already have an account? <Link href="/auth/login">Log in</Link>
      </p>
      <p className="mt-4 text-center text-xs text-muted">
        By signing up you agree to our{" "}
        <Link href="/terms" className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20">
          Terms
        </Link>
        ,{" "}
        <Link href="/privacy" className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20">
          Privacy Policy
        </Link>
        , and{" "}
        <Link href="/guidelines" className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20">
          Community Guidelines
        </Link>
        .
      </p>
    </section>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<section className="auth-panel-inner text-sm text-muted">Loading...</section>}>
      <SignupPageContent />
    </Suspense>
  );
}
