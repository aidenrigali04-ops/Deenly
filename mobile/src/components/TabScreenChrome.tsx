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
  style
}: {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.sectionCard, shadows.card, style]}>
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
    paddingBottom: 8
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
    ...type.pageTitle,
    fontSize: 32,
    color: colors.text
  },
  subtitle: {
    fontSize: type.meta.fontSize,
    lineHeight: 20,
    color: colors.muted,
    fontWeight: "400"
  },
  headerRight: {
    paddingTop: 4
  },
  sectionCard: {
    marginHorizontal: spacing.pagePaddingH,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    padding: spacing.cardPadding,
    gap: 10
  },
  sectionTitle: {
    ...type.sectionTitle,
    fontSize: 18,
    color: colors.text,
    marginBottom: 4
  }
});
