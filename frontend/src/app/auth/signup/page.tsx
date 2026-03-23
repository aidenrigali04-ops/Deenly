"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { fetchSessionMe, signup } from "@/lib/auth";
import { useSessionStore } from "@/store/session-store";

export default function SignupPage() {
  const router = useRouter();
  const setUser = useSessionStore((state) => state.setUser);
  const [form, setForm] = useState({
    email: "",
    username: "",
    password: "",
    displayName: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      await signup(form);
      const me = await fetchSessionMe();
      setUser(me);
      router.push("/feed");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to create account";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="mt-1 text-sm text-muted">Join to uplift, learn, and contribute.</p>
      </div>
      <form className="surface-card space-y-3" onSubmit={onSubmit}>
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          required
        />
        <input
          className="input"
          type="text"
          placeholder="Username (lowercase, numbers, underscore)"
          value={form.username}
          onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
          required
        />
        <input
          className="input"
          type="text"
          placeholder="Display name"
          value={form.displayName}
          onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          required
        />
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <button disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
        <p className="text-center text-xs text-muted">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-accent hover:underline">
            Login
          </Link>
        </p>
      </form>
    </section>
  );
}
