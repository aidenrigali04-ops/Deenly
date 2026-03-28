/**
 * Main app palette — matches [frontend/tailwind.config.ts] (light shell).
 * Use `onAccent` for text/icons on black primary buttons.
 */
export const colors = {
  background: "#f4f5f7",
  surface: "#ffffff",
  card: "#ffffff",
  border: "rgba(0, 0, 0, 0.1)",
  text: "#111111",
  muted: "#6b7280",
  accent: "#000000",
  onAccent: "#ffffff",
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
  mediaPreviewBorder: "#CBD5E1"
};

/** Radii aligned with web `rounded-panel` / `rounded-control` / `rounded-pill`. */
export const radii = {
  panel: 20,
  control: 14,
  pill: 999
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
