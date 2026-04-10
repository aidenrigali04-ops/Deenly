import type { ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, radii, shadows, spacing, type } from "../theme";

export function TabScreenRoot({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.root, style]}>{children}</View>;
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
  return (
    <View style={styles.header}>
      <View style={styles.headerTextRow}>
        <View style={styles.headerTitles}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
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
  return (
    <View
      style={[
        styles.sectionCard,
        elevated ? [styles.sectionCardElevated, shadows.card] : styles.sectionCardInset,
        style
      ]}
    >
      {sectionTitle ? <Text style={styles.sectionTitle}>{sectionTitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
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
    color: colors.text
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
    fontWeight: "400",
    letterSpacing: -0.2
  },
  headerRight: {
    paddingTop: 4
  },
  sectionCard: {
    marginHorizontal: spacing.pagePaddingH,
    padding: spacing.cardPaddingLg,
    gap: 12
  },
  sectionCardInset: {
    backgroundColor: colors.surface,
    borderRadius: radii.grouped,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  sectionCardElevated: {
    backgroundColor: colors.surface,
    borderRadius: radii.grouped,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  sectionTitle: {
    ...type.sectionTitle,
    color: colors.text,
    marginBottom: 2,
    letterSpacing: -0.3
  }
});
