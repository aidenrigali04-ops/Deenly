import { Platform, type TextStyle, type ViewStyle } from "react-native";

/**
 * Deenly mobile design system — warm neutrals, blue accent (#1055db), consistent rhythm.
 */
export const colors = {
  /** Soft warm gray page background */
  background: "#f5f4f1",
  /** Tab / stack roots stay transparent so atmosphere gradient shows through */
  atmosphere: "transparent",
  surface: "#ffffff",
  card: "#ffffff",
  /** Very light neutral border */
  border: "rgba(0, 0, 0, 0.06)",
  borderSubtle: "rgba(0, 0, 0, 0.05)",
  /** Near-black primary text */
  text: "#1a1a1a",
  /** Secondary / body muted */
  muted: "#6b6560",
  /** Tertiary / meta */
  mutedLight: "#9c9690",
  /** Primary brand — CTAs, links, active states */
  accent: "#1055db",
  onAccent: "#ffffff",
  accentMuted: "rgba(16, 85, 219, 0.12)",
  danger: "#b91c1c",
  success: "#15803d",
  shadow: "rgba(15, 23, 42, 0.06)",
  subtleFill: "rgba(16, 85, 219, 0.08)",
  createHeaderBar: "#0A0A0A",
  composerBg: "#E8EDF5",
  composerText: "#0F172A",
  composerMuted: "#64748B",
  composerInputBg: "#FFFFFF",
  composerBorder: "#CBD5E1",
  mediaPreviewBg: "#FFFFFF",
  mediaPreviewBorder: "#CBD5E1",
  glassFill: "rgba(255, 255, 255, 0.82)",
  glassFillStrong: "rgba(252, 252, 254, 0.94)"
};

export const atmosphereGradient = {
  colors: ["#e8ebe8", "#f0eeeb", "#f5f4f1"] as const,
  start: { x: 0.1, y: 0 },
  end: { x: 0.9, y: 1 }
};

/** Card 16, inputs 12, pills full */
export const radii = {
  card: 16,
  panel: 16,
  control: 12,
  pill: 999
};

/** Elevation: cards, accent glow on outline buttons, switch (Android) */
export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8
    },
    android: { elevation: 2 },
    default: {}
  }),
  /** Premium glow for primary outline buttons */
  accentGlow: Platform.select({
    ios: {
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 14
    },
    android: { elevation: 6 },
    default: {}
  }),
  accentGlowSoft: Platform.select({
    ios: {
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 10
    },
    android: { elevation: 3 },
    default: {}
  }),
  switchGlowAndroid: {
    elevation: 5
  }
};

/** Page and section rhythm */
export const spacing = {
  pagePaddingH: 16,
  pagePaddingTop: 16,
  sectionGap: 24,
  cardPadding: 16,
  cardPaddingLg: 20,
  /** @deprecated prefer pagePaddingH */
  screenHorizontal: 16,
  screenBottom: 40
};

/** Typography scale (approximate SF / system mapping) */
export const type = {
  pageTitle: { fontSize: 28, fontWeight: "700" as const, letterSpacing: -0.6 },
  sectionTitle: { fontSize: 20, fontWeight: "600" as const, letterSpacing: -0.3 },
  cardTitle: { fontSize: 18, fontWeight: "600" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
  bodyStrong: { fontSize: 16, fontWeight: "600" as const },
  meta: { fontSize: 13, fontWeight: "400" as const },
  metaSm: { fontSize: 12, fontWeight: "500" as const },
  button: { fontSize: 15, fontWeight: "600" as const },
  caption: { fontSize: 12, fontWeight: "500" as const }
};

/** Filled primary CTAs are avoided — use outline + glow + accent label. */
export const primaryButtonOutline: ViewStyle = {
  backgroundColor: colors.surface,
  borderWidth: 1.5,
  borderColor: colors.accent,
  alignItems: "center",
  justifyContent: "center",
  ...shadows.accentGlow
};

export const primaryButtonText: TextStyle = {
  color: colors.accent,
  fontWeight: "700",
  fontSize: 16
};

export const authTheme = {
  pageBg: colors.background,
  card: colors.surface,
  border: colors.border,
  text: colors.text,
  muted: colors.muted,
  submitBg: colors.surface,
  submitBorder: colors.accent,
  submitText: colors.accent,
  submitDisabled: "rgba(16, 85, 219, 0.4)",
  errorBg: "#fff1f2",
  errorBorder: "rgba(244, 63, 94, 0.35)",
  errorText: "#be123c",
  radiusPanel: radii.panel,
  radiusControl: radii.control,
  shadow: colors.shadow
};
