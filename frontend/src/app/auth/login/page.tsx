"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { fetchSessionMe, login } from "@/lib/auth";
import { useSessionStore } from "@/store/session-store";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useSessionStore((state) => state.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      await login({ email, password });
      const me = await fetchSessionMe();
      setUser(me);
      const next = searchParams.get("next") || "/home";
      router.push(next);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to login";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Login</h1>
        <p className="mt-1 text-sm text-muted">Welcome back to Deenly.</p>
      </div>
      <form className="surface-card space-y-3" onSubmit={onSubmit}>
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <button disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-center text-xs text-muted">
          Need an account?{" "}
          <Link href="/auth/signup" className="text-accent hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </section>
  );
}
