import { useMemo } from "react";
import { Platform, StyleSheet } from "react-native";
import { useAppChrome } from "../../lib/use-app-chrome";
import { fonts } from "../../theme";

const GOLD = "#feb101";
const GOLD_TEXT = "#0A0A0B";

/**
 * Figma “Social Media App UI” create flows — white panels on canvas, gold accents (not legacy teal/cyan).
 */
export function useCreateFlowTheme() {
  const { figma: f } = useAppChrome();

  return useMemo(() => {
    const hairline = StyleSheet.hairlineWidth;
    const panel = f.createFlowPanel ?? "#FFFFFF";
    const ink = f.createFlowInk ?? GOLD_TEXT;
    const inkMuted = f.createFlowInkMuted ?? "rgba(10,10,11,0.55)";
    const inkMuted2 = f.createFlowInkMuted2 ?? "rgba(10,10,11,0.42)";
    const fieldBg = f.createFlowField ?? "#F2F2F5";
    const panelBorder = f.createFlowPanelBorder ?? "rgba(10,10,11,0.1)";
    const chipPanelBg = f.createFlowChipOnPanel ?? "rgba(10,10,11,0.06)";
    const chipPanelBorder = f.createFlowChipOnPanelBorder ?? "rgba(10,10,11,0.1)";
    const chipCanvasBg = f.createFlowChipOnCanvas ?? "rgba(255,255,255,0.1)";
    const chipCanvasBorder = f.createFlowChipOnCanvasBorder ?? "rgba(255,255,255,0.16)";
    const accent = f.accentGold ?? GOLD;

    return {
      f,
      /** Icon tint on white panels (chevrons, etc.) */
      panelIconMuted: inkMuted2,
      /** Screen root */
      layout: { flex: 1 as const, backgroundColor: f.canvas },
      scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 28,
        gap: 20
      },
      /** White panel card */
      card: {
        backgroundColor: panel,
        borderRadius: f.cardRadiusMd,
        padding: 20,
        gap: 14,
        borderWidth: hairline,
        borderColor: panelBorder
      },
      sectionTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        fontWeight: "700" as const,
        color: ink,
        letterSpacing: -0.35,
        marginBottom: 2
      },
      upperLabel: {
        fontSize: 11,
        fontWeight: "700" as const,
        color: inkMuted2,
        letterSpacing: 0.85,
        textTransform: "uppercase" as const,
        marginTop: 4
      },
      /** Helper on white panels */
      helper: {
        fontSize: 13,
        color: inkMuted,
        lineHeight: 19
      },
      helperSmall: {
        fontSize: 12,
        color: inkMuted2,
        lineHeight: 17
      },
      /** Helper on black canvas (loading, hints outside cards) */
      canvasHelper: {
        fontSize: 13,
        color: f.textMuted,
        lineHeight: 19
      },
      canvasHelperSmall: {
        fontSize: 12,
        color: f.textMuted2,
        lineHeight: 17
      },
      field: {
        minHeight: 48,
        backgroundColor: fieldBg,
        borderRadius: 14,
        paddingHorizontal: 14,
        fontSize: 16,
        color: ink
      },
      fieldFocused: {
        borderWidth: 1.5,
        borderColor: accent
      },
      fieldLabel: {
        fontSize: 12,
        fontWeight: "600" as const,
        color: inkMuted,
        marginBottom: 6
      },
      placeholderColor: inkMuted2,
      /** Segmented control on black canvas (post type) */
      segmentTrack: {
        flexDirection: "row" as const,
        backgroundColor: f.glassSoft,
        borderRadius: 999,
        padding: 4,
        gap: 4,
        borderWidth: hairline,
        borderColor: f.glassBorderSoft
      },
      /** Segmented control on white panel */
      segmentTrackPanel: {
        flexDirection: "row" as const,
        backgroundColor: fieldBg,
        borderRadius: 999,
        padding: 4,
        gap: 4,
        borderWidth: hairline,
        borderColor: chipPanelBorder
      },
      segmentPill: {
        flex: 1,
        minHeight: 40,
        borderRadius: 999,
        alignItems: "center" as const,
        justifyContent: "center" as const
      },
      segmentPillActive: {
        backgroundColor: accent,
        ...Platform.select({
          ios: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.18,
            shadowRadius: 6
          },
          android: { elevation: 3 },
          default: {}
        })
      },
      segmentPillIdle: {
        backgroundColor: "transparent"
      },
      segmentTextIdle: {
        fontSize: 14,
        fontWeight: "600" as const,
        color: f.textMuted
      },
      segmentTextIdlePanel: {
        fontSize: 14,
        fontWeight: "600" as const,
        color: inkMuted
      },
      segmentTextActive: {
        fontSize: 14,
        fontWeight: "700" as const,
        color: GOLD_TEXT
      },
      /** Chips on white panel (default) */
      chip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: chipPanelBg,
        borderWidth: hairline,
        borderColor: chipPanelBorder
      },
      chipActive: {
        backgroundColor: accent,
        borderColor: accent
      },
      chipText: {
        fontSize: 14,
        fontWeight: "600" as const,
        color: inkMuted
      },
      chipTextActive: {
        color: GOLD_TEXT
      },
      /** Chips on black canvas (listing kind) */
      chipCanvas: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: chipCanvasBg,
        borderWidth: hairline,
        borderColor: chipCanvasBorder
      },
      chipCanvasActive: {
        backgroundColor: accent,
        borderColor: accent
      },
      chipCanvasText: {
        fontSize: 14,
        fontWeight: "600" as const,
        color: f.textMuted
      },
      chipCanvasTextActive: {
        color: GOLD_TEXT
      },
      stickyBar: {
        backgroundColor: f.canvas,
        borderTopWidth: hairline,
        borderTopColor: f.glassBorder,
        paddingHorizontal: 20,
        paddingTop: 12,
        gap: 10
      },
      primaryCta: {
        minHeight: 52,
        borderRadius: 16,
        backgroundColor: accent,
        alignItems: "center" as const,
        justifyContent: "center" as const
      },
      primaryCtaDisabled: {
        opacity: 0.45
      },
      primaryCtaLabel: {
        fontSize: 16,
        fontWeight: "700" as const,
        color: GOLD_TEXT
      },
      secondaryCta: {
        minHeight: 44,
        alignItems: "center" as const,
        justifyContent: "center" as const
      },
      secondaryCtaLabel: {
        fontSize: 15,
        fontWeight: "600" as const,
        color: accent
      },
      error: { color: "#FF6B6B", fontSize: 14 },
      errorSmall: { color: "#FF6B6B", fontSize: 12 },
      collapsibleTitle: {
        fontSize: 15,
        fontWeight: "600" as const,
        color: ink,
        flex: 1
      },
      uploadSurface: {
        borderRadius: f.cardRadiusMd,
        backgroundColor: fieldBg,
        overflow: "hidden" as const,
        borderWidth: hairline,
        borderColor: panelBorder
      },
      uploadEmptyTitle: {
        fontSize: 16,
        fontWeight: "700" as const,
        color: ink,
        textAlign: "center" as const
      },
      uploadEmptyHint: {
        fontSize: 13,
        color: inkMuted,
        textAlign: "center" as const,
        lineHeight: 18
      },
      postingTrack: {
        flexDirection: "row" as const,
        backgroundColor: f.glassSoft,
        borderRadius: 999,
        padding: 4,
        gap: 6,
        borderWidth: hairline,
        borderColor: f.glassBorder
      },
      postingPill: {
        flex: 1,
        minHeight: 40,
        borderRadius: 999,
        alignItems: "center" as const,
        justifyContent: "center" as const
      },
      postingPillActive: {
        backgroundColor: accent
      },
      postingPillIdle: {
        backgroundColor: "transparent"
      },
      postingTextIdle: {
        fontSize: 14,
        fontWeight: "600" as const,
        color: f.textMuted2
      },
      postingTextActive: {
        fontSize: 14,
        fontWeight: "700" as const,
        color: GOLD_TEXT
      },
      hairlineDivider: {
        height: hairline,
        backgroundColor: panelBorder,
        marginVertical: 8
      },
      chipScrollRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
        paddingVertical: 4
      },
      composerIdentityRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12
      },
      composerAvatar: {
        width: 44,
        height: 44,
        borderRadius: 999,
        borderWidth: hairline,
        borderColor: panelBorder
      },
      composerAvatarFallback: {
        width: 44,
        height: 44,
        borderRadius: 999,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        backgroundColor: fieldBg,
        borderWidth: hairline,
        borderColor: panelBorder
      },
      composerAvatarLetter: {
        fontSize: 17,
        fontWeight: "700" as const,
        color: ink
      },
      composerDisplayName: {
        flex: 1,
        fontSize: 16,
        fontWeight: "600" as const,
        color: ink,
        letterSpacing: -0.2
      },
      promoteRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 12
      },
      promoteTextWrap: { flex: 1, minWidth: 0 },
      promoteTitle: {
        fontSize: 16,
        fontWeight: "700" as const,
        color: ink,
        letterSpacing: -0.25
      },
      surfaceTextButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: 10,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 14,
        backgroundColor: fieldBg,
        borderWidth: hairline,
        borderColor: panelBorder,
        minHeight: 48,
        alignSelf: "stretch" as const
      },
      surfaceTextButtonLabel: {
        fontSize: 14,
        fontWeight: "600" as const,
        color: "#B8830A"
      },
      surfaceTextButtonLeading: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "flex-start" as const,
        gap: 10,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 14,
        backgroundColor: fieldBg,
        borderWidth: hairline,
        borderColor: panelBorder,
        minHeight: 48,
        alignSelf: "flex-start" as const
      },
      settingsRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        minHeight: 48,
        paddingVertical: 4
      },
      settingsRowTextCol: {
        flex: 1,
        minWidth: 0,
        gap: 4
      },
      settingsRowTitle: {
        fontSize: 15,
        fontWeight: "600" as const,
        color: ink
      },
      textLinkPressable: {
        paddingVertical: 8,
        minHeight: 44,
        alignSelf: "flex-start" as const,
        justifyContent: "center" as const
      },
      inlineHintRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingHorizontal: 2
      },
      metaRow: {
        flexDirection: "row" as const,
        justifyContent: "space-between" as const,
        alignItems: "center" as const,
        minHeight: 44,
        paddingVertical: 4
      },
      metaRowLabel: {
        fontSize: 15,
        fontWeight: "600" as const,
        color: ink
      },
      metaRowValue: {
        fontSize: 14,
        fontWeight: "500" as const,
        color: inkMuted
      },
      selectableListRow: {
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 14,
        backgroundColor: fieldBg,
        borderWidth: hairline,
        borderColor: panelBorder,
        minHeight: 48,
        justifyContent: "center" as const,
        alignSelf: "stretch" as const
      },
      selectableListRowText: {
        fontSize: 13,
        fontWeight: "600" as const,
        color: ink
      },
      loadingRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10
      }
    };
  }, [f]);
}
