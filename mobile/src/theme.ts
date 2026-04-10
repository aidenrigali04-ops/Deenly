import { Platform, type TextStyle, type ViewStyle } from "react-native";

/**
 * Deenly mobile design system — warm neutrals, teal accent (#156B75), semantic tokens.
 * Primary actions: filled accent. Secondary: accent tint fill. Tertiary: text-only / links.
 */
export const colors = {
  background: "#F6F5F2",
  backgroundSubtle: "#FBFBF9",
  atmosphere: "transparent",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  surfaceSecondary: "#F8F8F6",
  surfaceTinted: "#EEF6F5",

  border: "rgba(17, 17, 17, 0.06)",
  borderSubtle: "rgba(17, 17, 17, 0.06)",
  borderInteractive: "rgba(17, 17, 17, 0.08)",
  borderFocus: "rgba(21, 107, 117, 0.28)",

  text: "#111111",
  muted: "#666666",
  mutedLight: "#8C8C8C",
  textInverse: "#FFFFFF",

  accent: "#156B75",
  accentHover: "#115B64",
  accentPressed: "#0D4A51",
  accentTint: "#EAF5F4",
  accentTextOnTint: "#145F68",
  onAccent: "#FFFFFF",
  /** @deprecated prefer accentTint for fills */
  accentMuted: "rgba(21, 107, 117, 0.12)",

  success: "#2F7A45",
  warning: "#B7791F",
  danger: "#C0392B",

  shadow: "rgba(0, 0, 0, 0.04)",
  subtleFill: "rgba(21, 107, 117, 0.08)",

  createHeaderBar: "#0A0A0A",
  composerBg: "#EEF6F5",
  composerText: "#111111",
  composerMuted: "#666666",
  composerInputBg: "#FFFFFF",
  composerBorder: "rgba(17,17,17,0.08)",
  mediaPreviewBg: "#FFFFFF",
  mediaPreviewBorder: "rgba(17,17,17,0.08)",
  glassFill: "rgba(255, 255, 255, 0.92)",
  glassFillStrong: "#FFFFFF"
};

export const atmosphereGradient = {
  colors: ["#F0EFE9", "#F4F3EF", "#F6F5F2"] as const,
  start: { x: 0.1, y: 0 },
  end: { x: 0.9, y: 1 }
};

/** control 12 (inputs/chips), button 14, card 20, sheet 24 */
export const radii = {
  control: 12,
  button: 14,
  card: 20,
  panel: 20,
  sheet: 24,
  pill: 999
};

export const shadows = {
  /** 0 1px 2px ~3% */
  low: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 2
    },
    android: { elevation: 1 },
    default: {}
  }),
  medium: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.04,
      shadowRadius: 20
    },
    android: { elevation: 3 },
    default: {}
  }),
  focusRing: Platform.select({
    ios: {
      shadowColor: "#156B75",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.08,
      shadowRadius: 4
    },
    android: {},
    default: {}
  }),
  card: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 2
    },
    android: { elevation: 1 },
    default: {}
  }),
  /** Soft chip / switch halo — keep minimal */
  accentGlowSoft: Platform.select({
    ios: {
      shadowColor: "#156B75",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4
    },
    android: { elevation: 1 },
    default: {}
  }),
  switchGlowAndroid: {
    elevation: 2
  }
};

export const spacing = {
  micro: 4,
  tight: 8,
  fieldLabel: 12,
  pagePaddingH: 16,
  pagePaddingTop: 16,
  breathing: 20,
  sectionGap: 24,
  largeTop: 32,
  cardPadding: 16,
  cardPaddingLg: 20,
  screenHorizontal: 16,
  screenBottom: 40
};

export const type = {
  displayLarge: { fontSize: 34, fontWeight: "600" as const, letterSpacing: -0.5, lineHeight: 40 },
  pageTitle: { fontSize: 30, fontWeight: "600" as const, letterSpacing: -0.4, lineHeight: 36 },
  sectionTitle: { fontSize: 22, fontWeight: "600" as const, letterSpacing: -0.2, lineHeight: 28 },
  cardTitle: { fontSize: 18, fontWeight: "600" as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: "400" as const, lineHeight: 22 },
  bodyStrong: { fontSize: 16, fontWeight: "500" as const, lineHeight: 22 },
  meta: { fontSize: 14, fontWeight: "400" as const, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: "500" as const, lineHeight: 16 },
  metaSm: { fontSize: 12, fontWeight: "500" as const },
  button: { fontSize: 15, fontWeight: "600" as const },
  caption: { fontSize: 12, fontWeight: "500" as const }
};

/** One primary CTA per screen — filled accent, optional soft lift */
export const primaryButton: ViewStyle = {
  backgroundColor: colors.accent,
  borderRadius: radii.button,
  minHeight: 50,
  paddingHorizontal: 18,
  paddingVertical: 12,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 0,
  ...shadows.low
};

export const primaryButtonLabel: TextStyle = {
  color: colors.onAccent,
  fontWeight: "600",
  fontSize: 16
};

/** Important secondary actions — tinted fill, no border */
export const secondaryButton: ViewStyle = {
  backgroundColor: colors.accentTint,
  borderRadius: radii.button,
  minHeight: 48,
  paddingHorizontal: 18,
  paddingVertical: 11,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 0
};

export const secondaryButtonLabel: TextStyle = {
  color: colors.accentTextOnTint,
  fontWeight: "600",
  fontSize: 15
};

/** @deprecated use primaryButton — filled primary, not outline */
export const primaryButtonOutline = primaryButton;

/** @deprecated use primaryButtonLabel */
export const primaryButtonText = primaryButtonLabel;

export const authTheme = {
  pageBg: colors.background,
  card: colors.surface,
  border: colors.border,
  text: colors.text,
  muted: colors.muted,
  submitBg: colors.accent,
  submitBorder: "transparent",
  submitText: colors.onAccent,
  submitDisabled: "rgba(21, 107, 117, 0.38)",
  errorBg: "#fff1f2",
  errorBorder: "rgba(244, 63, 94, 0.35)",
  errorText: "#be123c",
  radiusPanel: radii.panel,
  radiusControl: radii.control,
  shadow: colors.shadow
};
