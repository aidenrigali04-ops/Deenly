import { Platform, StyleSheet, type TextStyle, type ViewStyle } from "react-native";

/**
 * Deenly mobile design system — hybrid: iOS-like grouped canvas + hairlines, M3-like tonal fields
 * and flat filled buttons. Teal accent (#156B75).
 */
/**
 * Shared surfaces for feed-style screens (social / Figma-style app kits).
 * Use for Home, Market, Profile body, Search, Chat — not auth chrome.
 */
export const social = {
  canvas: "#EEF0F5",
  marketplaceCanvas: "#EEF0F5",
  chrome: "#FFFFFF",
  chromeBorder: "rgba(10, 10, 11, 0.07)",
  iconWell: "#F2F3F5",
  tabBarBg: "#FFFFFF",
  tabActive: "#0A0A0B",
  tabMuted: "#8E9199",
  /** Story-style ring around avatars on profile */
  avatarRing: "rgba(255, 255, 255, 0.95)"
} as const;

/**
 * Figma “Social Media App UI” — dark mobile kit (Home / Discover / Profile frames).
 * Phased rollout: import alongside legacy `colors` where screens are migrated.
 */
export const figmaMobile = {
  canvas: "#000000",
  /** Figma home / discover feed cards (was #414141; exports use ~#1A1A1A) */
  card: "#1A1A1A",
  cardRadiusLg: 32,
  cardRadiusMd: 20,
  /** Subtle vertical depth on feed cards */
  feedCardGradientEnd: "#252525",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.9)",
  textMuted: "rgba(255,255,255,0.8)",
  textMuted2: "rgba(255,255,255,0.75)",
  glass: "rgba(255,255,255,0.12)",
  glassBorder: "rgba(255,255,255,0.12)",
  glassSoft: "rgba(255,255,255,0.08)",
  glassBorderSoft: "rgba(255,255,255,0.08)",
  accentGold: "#feb101",
  linkCyan: "#01dcfe",
  /** Tab bar capsule — slightly lifted glass, softer edge than pure black */
  tabBarFill: "rgba(18,18,20,0.55)",
  tabBarBorder: "rgba(255,255,255,0.09)",
  gradientTop: "rgba(0,0,0,0.35)",
  gradientBottom: "rgba(0,0,0,0.45)",
  /** Deenly brand actions (checkout, verified flows) */
  brandTeal: "#156B75",
  /** In-card media / letterbox (dark kit) */
  mediaSurface: "#2a2a2a",
  /** Initials on bright avatar placeholder */
  avatarInitialInk: "#1a1a1a",
  /** Grid tile fallback under video thumbs */
  videoThumbFallback: "#1f2937",
  /** Messages screen — white chrome on black (Figma kit) */
  messagesChrome: "#FFFFFF",
  messagesChromeText: "#0A0A0B",
  messagesChromePlaceholder: "rgba(10,10,11,0.45)",
  /** Near-black icon ink (Figma kit) */
  chromeInk: "#000001"
} as const;

/**
 * Urbanist — loaded in App.tsx via @expo-google-fonts/urbanist (`useFonts` keys must match).
 */
export const fonts = {
  regular: "Urbanist_400Regular",
  medium: "Urbanist_500Medium",
  semiBold: "Urbanist_600SemiBold",
  bold: "Urbanist_700Bold"
} as const;

/**
 * Home + Marketplace feed — Social Media App UI, dev node 1-118:
 * https://www.figma.com/design/ENiMwuzckx3GS38GvaU76W/Social-Media-App-UI?node-id=1-118&m=dev
 */
export const figmaMobileHome = {
  feedCardBg: "#414141",
  feedCardRadius: 32,
  feedListGap: 16,
  pagePadH: 20,
  /** Hero orb — #FE2D30 @ 25% */
  accentOrb: "rgba(254, 45, 48, 0.25)",
  accentOrbSize: 380,
  accentOrbTop: -220,
  accentOrbLeft: -95,
  authorPillRadius: 48,
  authorPillPadV: 6,
  authorPillPadLeft: 8,
  authorPillPadRight: 18,
  authorAvatarSize: 42,
  authorNameSize: 14,
  authorNameLineHeight: 16,
  authorTimeSize: 12,
  authorTimeColor: "rgba(255, 255, 255, 0.9)",
  menuBtnSize: 54,
  menuBtnRadius: 32,
  scrimTopHeightRatio: 0.33,
  scrimBottomHeightRatio: 0.43,
  engageRowGap: 54,
  engageIconSize: 28,
  engageCountSize: 16,
  engageCountLineHeight: 20,
  captionSize: 14,
  captionLineHeight: 18,
  headerAvatarSize: 48,
  headerPadVTop: 8,
  headerPadVBottom: 16
} as const;

/**
 * Floating tab bar + segmented chrome (logical pt). Edit values to match Figma inspector.
 *
 * Source frame (bottom nav / mobile tab bar):
 * https://www.figma.com/design/ENiMwuzckx3GS38GvaU76W/Social-Media-App-UI?node-id=1-209
 *
 * In Figma: select the tab bar group → Layout / Dimensions / Corner radius / Effects; paste here.
 *
 * Drop shadow (Figma inspector): X −11, Y −1, blur 18.8, spread 0, #000000 @ 10%.
 */
export const figmaMobileNav = {
  tabBarInsetHorizontal: 16,
  /** Minimum space between bar bottom and home indicator when inset is small */
  tabBarInsetBottomMin: 12,
  tabBarCapsuleBorderRadius: 32,
  tabBarMinHeight: 56,
  tabBarPaddingTop: 6,
  tabBarPaddingBottom: 8,
  tabBarBorderWidth: StyleSheet.hairlineWidth,
  /** Android: no spread in Figma; elevation is an approximation of the same depth. */
  tabBarElevationAndroid: 8,
  tabBarShadowColorIOS: "#000000",
  tabBarShadowOpacityIOS: 0.1,
  tabBarShadowRadiusIOS: 18.8,
  tabBarShadowOffsetXIOS: -11,
  tabBarShadowOffsetYIOS: -1,
  tabIconFrameMinWidth: 40,
  tabIconFrameMinHeight: 34,
  tabIconFrameRadius: 14,
  tabIconFramePadHorizontal: 8,
  tabIconFramePadVertical: 5,
  tabIconFrameFillFocused: "rgba(255,255,255,0.1)",
  tabIconFrameBorderFocused: "rgba(255,255,255,0.1)",
  tabLabelFontSize: 10,
  tabLabelLetterSpacing: 0.12,
  tabLabelMaxWidth: 56,
  tabLabelMarginTop: 2,
  /** Discover/Market + profile Posts/Products track */
  segmentTrackPadding: 4,
  segmentTrackGap: 4,
  segmentTrackRadius: 18,
  segmentInnerRadius: 12,
  segmentPillVerticalPadding: 10,
  unreadBadgeSize: 7,
  unreadBadgeBorderWidth: 2,
  unreadBadgeBorderColor: "#121214"
} as const;

/**
 * Profile (Account) — Social Media App UI, dev node 1-373:
 * https://www.figma.com/design/ENiMwuzckx3GS38GvaU76W/Social-Media-App-UI?node-id=1-373&m=dev
 */
export const figmaMobileProfile = {
  accentOrb: "rgba(254, 45, 48, 0.25)",
  accentOrbSize: 340,
  accentOrbTop: -200,
  accentOrbLeft: -100,
  avatarSize: 100,
  avatarRadius: 25,
  heroPadH: 20,
  heroGap: 14,
  nameColumnGap: 12,
  displayNameSize: 18,
  displayNameLineHeight: 24,
  usernameSize: 12,
  usernameLineHeight: 16,
  usernameColor: "rgba(255, 255, 255, 0.8)",
  pillBg: "rgba(255, 255, 255, 0.12)",
  pillBorder: "rgba(255, 255, 255, 0.08)",
  pillRadius: 18,
  pillPadH: 18,
  pillPadV: 6,
  pillTextSize: 14,
  pillTextLineHeight: 20,
  infoPanelBg: "rgba(255, 255, 255, 0.08)",
  infoPanelBorder: "rgba(255, 255, 255, 0.12)",
  infoPanelRadius: 25,
  infoPanelPadTop: 24,
  infoPanelPadBottom: 26,
  infoPanelPadH: 24,
  infoPanelGap: 16,
  statsRowPadBottom: 18,
  statsRowBorder: "rgba(255, 255, 255, 0.12)",
  statColumnsGap: 34,
  statNumberSize: 18,
  statNumberLineHeight: 24,
  statLabelSize: 12,
  statLabelLineHeight: 16,
  statLabelColor: "rgba(255, 255, 255, 0.8)",
  statStackGap: 2,
  bioTextSize: 12,
  bioLineHeight: 20,
  contentTabGap: 38,
  contentTabIcon: 24,
  contentTabLabelSize: 12,
  contentTabLabelLineHeight: 16,
  gridPadH: 20,
  gridGap: 12,
  gridTileRadius: 20,
  gridTileBg: "#414141"
} as const;

/** Tab-root backdrop — maroon wash top-left, fades to black (Figma home canvas) */
export const figmaAtmosphere = {
  colors: ["#3a1820", "#1c0a10", "#000000", "#000000"] as const,
  start: { x: 0.15, y: 0 },
  end: { x: 0.5, y: 1 }
};

export const colors = {
  /** Tab / settings canvas (iOS grouped style) */
  background: "#F2F2F7",
  backgroundSubtle: "#FAFAFA",
  atmosphere: "transparent",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  /** Secondary blocks, message bubbles (other) */
  surfaceSecondary: "#E5E5EA",
  /** Teal-tinted highlight areas */
  surfaceTinted: "#E8F2F3",
  /** Filled search / text fields (Material tonal) */
  surfaceField: "#EBEBF0",

  border: "rgba(60, 60, 67, 0.18)",
  borderSubtle: "rgba(60, 60, 67, 0.12)",
  borderInteractive: "rgba(60, 60, 67, 0.22)",
  borderFocus: "rgba(21, 107, 117, 0.35)",

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

  shadow: "rgba(0, 0, 0, 0.06)",
  subtleFill: "rgba(21, 107, 117, 0.1)",
  /** List / control press (M3 state layer, light) */
  statePressed: "rgba(0, 0, 0, 0.05)",

  createHeaderBar: "#0A0A0A",
  composerBg: "#E8F2F3",
  composerText: "#111111",
  composerMuted: "#666666",
  composerInputBg: "#FFFFFF",
  composerBorder: "rgba(17,17,17,0.08)",
  mediaPreviewBg: "#FFFFFF",
  mediaPreviewBorder: "rgba(17,17,17,0.08)",
  glassFill: "rgba(255, 255, 255, 0.88)",
  glassFillStrong: "#FFFFFF"
};

export const atmosphereGradient = {
  colors: ["#EBEBF0", "#EFEFF4", "#F2F2F7"] as const,
  start: { x: 0.2, y: 0 },
  end: { x: 0.8, y: 1 }
};

/** control 12, button 14, grouped panels 14, sheet 20 */
export const radii = {
  control: 12,
  button: 14,
  /** Inset grouped sections (settings-style) */
  grouped: 14,
  /** Feed + listing cards — slightly rounder social-app feel */
  card: 20,
  /** Figma home / discover large post shells */
  feedCard: 32,
  /** Figma home feed + event promo cards (large radius) */
  feedCardHero: 40,
  panel: 16,
  sheet: 20,
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
  /** Feed / product cards on canvas — soft diffuse lift */
  card: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 14
    },
    android: { elevation: 2 },
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
  displayLarge: {
    fontFamily: fonts.bold,
    fontSize: 34,
    fontWeight: "700" as const,
    letterSpacing: -0.8,
    lineHeight: 40
  },
  /** Tab roots — Apple large-title feel */
  navLargeTitle: {
    fontFamily: fonts.bold,
    fontSize: 32,
    fontWeight: "700" as const,
    letterSpacing: -0.6,
    lineHeight: 38
  },
  /** Center title in fixed top chrome (Home bar, Profile @handle) — same family, bar-safe size */
  navChromeTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    fontWeight: "700" as const,
    letterSpacing: -0.55,
    lineHeight: 26
  },
  pageTitle: {
    fontFamily: fonts.bold,
    fontSize: 28,
    fontWeight: "700" as const,
    letterSpacing: -0.5,
    lineHeight: 34
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 20,
    fontWeight: "600" as const,
    letterSpacing: -0.25,
    lineHeight: 26
  },
  /** Grouped list section labels (sentence case, not all-caps) */
  sectionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    fontWeight: "600" as const,
    letterSpacing: -0.1,
    lineHeight: 16
  },
  cardTitle: { fontFamily: fonts.semiBold, fontSize: 18, fontWeight: "600" as const, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, fontWeight: "400" as const, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 16, fontWeight: "500" as const, lineHeight: 22 },
  meta: { fontFamily: fonts.regular, fontSize: 14, fontWeight: "400" as const, lineHeight: 20 },
  label: { fontFamily: fonts.medium, fontSize: 13, fontWeight: "500" as const, lineHeight: 16 },
  metaSm: { fontFamily: fonts.medium, fontSize: 12, fontWeight: "500" as const },
  button: { fontFamily: fonts.semiBold, fontSize: 15, fontWeight: "600" as const },
  caption: { fontFamily: fonts.medium, fontSize: 12, fontWeight: "500" as const }
};

/** One primary CTA — Material-style filled (flat, no drop shadow) */
export const primaryButton: ViewStyle = {
  backgroundColor: colors.accent,
  borderRadius: radii.button,
  minHeight: 50,
  paddingHorizontal: 20,
  paddingVertical: 12,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 0
};

export const primaryButtonLabel: TextStyle = {
  fontFamily: fonts.semiBold,
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
  fontFamily: fonts.semiBold,
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
