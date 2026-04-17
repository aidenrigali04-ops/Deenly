"use client";

import type { ReactNode } from "react";

type ProfilePageShellProps = {
  children: ReactNode;
  /** Slightly tighter bottom padding when followed by extra sections (e.g. public profile monetization). */
  variant?: "default" | "compactFooter";
  /** Figma-aligned dark profile surfaces inside the social shell. */
  appearance?: "light" | "social";
};

export function ProfilePageShell({
  children,
  variant = "default",
  appearance = "light"
}: ProfilePageShellProps) {
  const footerPad = variant === "compactFooter" ? "pb-6" : "pb-10";
  const surface =
    appearance === "social"
      ? "rounded-[25px] border border-white/12 bg-white/[0.08] px-4 pt-6 text-white shadow-none md:px-8"
      : "surface-card rounded-b-2xl border border-black/10 px-4 pt-6 shadow-soft md:px-8";
  return (
    <section className="mx-auto w-full max-w-4xl">
      <article className={`${surface} ${footerPad}`}>{children}</article>
    </section>
  );
}

type ProfileLayoutColumnsProps = {
  avatar: ReactNode;
  main: ReactNode;
};

/** Avatar column + main column; shared by account and public profile. */
export function ProfileLayoutColumns({ avatar, main }: ProfileLayoutColumnsProps) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <div className="flex shrink-0 justify-center md:block">{avatar}</div>
      <div className="min-w-0 flex-1">{main}</div>
    </div>
  );
}
