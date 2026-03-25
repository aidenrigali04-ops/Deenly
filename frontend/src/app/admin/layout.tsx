"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/session-store";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const adminOwnerEmail = String(process.env.NEXT_PUBLIC_ADMIN_OWNER_EMAIL || "")
    .trim()
    .toLowerCase();
  const canAccessAdmin =
    Boolean(user?.role === "admin" || user?.role === "moderator") &&
    Boolean(user?.email) &&
    Boolean(adminOwnerEmail) &&
    String(user?.email || "").toLowerCase() === adminOwnerEmail;

  useEffect(() => {
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (!canAccessAdmin) {
      router.replace("/home");
    }
  }, [canAccessAdmin, router, user]);

  if (!user || !canAccessAdmin) {
    return null;
  }

  return <>{children}</>;
}
