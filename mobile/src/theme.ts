import { Platform } from "react-native";

/**
 * Main app palette — matches [frontend/tailwind.config.ts] (light shell).
 * Use `onAccent` for text/icons on black primary buttons.
 */
export const colors = {
  background: "#f4f5f7",
  /** Tab / stack roots can use transparent so the atmosphere gradient shows through. */
  atmosphere: "transparent",
  surface: "#ffffff",
  card: "#ffffff",
  border: "rgba(0, 0, 0, 0.1)",
  /** Hairlines inside grouped lists (SaaS-style separators) */
  borderSubtle: "rgba(0, 0, 0, 0.06)",
  /** Barely visible dividers for conversation items */
  borderFaint: "rgba(0, 0, 0, 0.03)",
  text: "#1C1C1E",
  muted: "#8E8E93",
  accent: "#000000",
  onAccent: "#ffffff",
  /** Apple-style blue for interactive indicators, send, unread */
  brand: "#0A84FF",
  brandSubtle: "rgba(10, 132, 255, 0.06)",
  /** iOS systemGray6 — borderless fill for inputs, other bubbles */
  fill: "#F2F2F7",
  danger: "#dc2626",
  success: "#16a34a",
  shadow: "rgba(15, 23, 42, 0.08)",
  /** Subtle fill (web hover black/[0.04]) */
  subtleFill: "rgba(0, 0, 0, 0.04)",
  createHeaderBar: "#0A0A0A",
  composerBg: "#E8EDF5",
  composerText: "#0F172A",
  composerMuted: "#64748B",
  composerInputBg: "#FFFFFF",
  composerBorder: "#CBD5E1",
  mediaPreviewBg: "#FFFFFF",
  mediaPreviewBorder: "#CBD5E1",
  /** Translucent surfaces (Android / fallback where blur is weak). */
  glassFill: "rgba(255, 255, 255, 0.78)",
  glassFillStrong: "rgba(252, 252, 254, 0.92)"
};

/** Soft multi-stop gradient behind main tabs (iOS-style light depth). */
export const atmosphereGradient = {
  colors: ["#e8edf5", "#f2eef8", "#f4f5f7"] as const,
  start: { x: 0.1, y: 0 },
  end: { x: 0.9, y: 1 }
};

/** Radii aligned with web `rounded-panel` / `rounded-control` / `rounded-pill`. */
export const radii = {
  panel: 24,
  control: 12,
  bubble: 20,
  pill: 999
};

/** Soft elevation for cards (settings, summaries). */
export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 10
    },
    android: { elevation: 2 },
    default: {}
  }),
  elevated: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 16
    },
    android: { elevation: 4 },
    default: {}
  })
};

/** Consistent screen gutters. */
export const spacing = {
  screenHorizontal: 20,
  screenBottom: 40,
  sectionGap: 24
};

/** Light auth screens — same tokens as main app; kept for explicit Login/Signup imports. */
export const authTheme = {
  pageBg: colors.background,
  card: colors.surface,
  border: colors.border,
  text: colors.text,
  muted: colors.muted,
  submitBg: colors.accent,
  submitText: colors.onAccent,
  submitDisabled: "rgba(0, 0, 0, 0.45)",
  errorBg: "#fff1f2",
  errorBorder: "rgba(244, 63, 94, 0.35)",
  errorText: "#be123c",
  radiusPanel: radii.panel,
  radiusControl: radii.control,
  shadow: colors.shadow
};
