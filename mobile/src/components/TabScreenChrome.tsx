import type { ReactNode } from "react";
import { useMemo } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { radii, shadows, spacing, type } from "../theme";
import { useAppChrome } from "../lib/use-app-chrome";

export function TabScreenRoot({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { figma } = useAppChrome();
  const root = useMemo(() => ({ flex: 1 as const, backgroundColor: figma.canvas }), [figma.canvas]);
  return <View style={[root, style]}>{children}</View>;
}

export function TabScreenHeader({
  title,
  subtitle,
  headerRight
}: {
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
}) {
  const { figma } = useAppChrome();
  const s = useMemo(
    () =>
      StyleSheet.create({
        header: {
          paddingHorizontal: spacing.pagePaddingH,
          paddingTop: spacing.pagePaddingTop,
          paddingBottom: 10
        },
        headerTextRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12
        },
        headerTitles: {
          flex: 1,
          gap: 6
        },
        title: {
          ...type.navLargeTitle,
          color: figma.text
        },
        subtitle: {
          fontSize: 15,
          lineHeight: 21,
          color: figma.textMuted,
          fontWeight: "400",
          letterSpacing: -0.2
        },
        headerRight: {
          paddingTop: 4
        }
      }),
    [figma.text, figma.textMuted]
  );

  return (
    <View style={s.header}>
      <View style={s.headerTextRow}>
        <View style={s.headerTitles}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
        {headerRight ? <View style={s.headerRight}>{headerRight}</View> : null}
      </View>
    </View>
  );
}

export function SectionCard({
  title: sectionTitle,
  children,
  style,
  /** Use for dense stacks (e.g. search) where a soft lift helps scanning */
  elevated = false
}: {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
}) {
  const { figma } = useAppChrome();
  const s = useMemo(
    () =>
      StyleSheet.create({
        sectionCard: {
          marginHorizontal: spacing.pagePaddingH,
          padding: spacing.cardPaddingLg,
          gap: 12
        },
        sectionCardInset: {
          backgroundColor: figma.glassSoft,
          borderRadius: radii.feedCard,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: figma.glassBorder,
          ...shadows.low
        },
        sectionCardElevated: {
          backgroundColor: figma.glassSoft,
          borderRadius: radii.feedCard,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: figma.glassBorder
        },
        sectionTitle: {
          ...type.sectionTitle,
          color: figma.text,
          marginBottom: 2,
          letterSpacing: -0.3
        }
      }),
    [figma.glassBorder, figma.glassSoft, figma.text]
  );

  return (
    <View
      style={[
        s.sectionCard,
        elevated ? [s.sectionCardElevated, shadows.card] : s.sectionCardInset,
        style
      ]}
    >
      {sectionTitle ? <Text style={s.sectionTitle}>{sectionTitle}</Text> : null}
      {children}
    </View>
  );
}
