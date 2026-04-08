import type { ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, radii, shadows, spacing } from "../theme";

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
    paddingHorizontal: spacing.screenHorizontal,
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
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    fontWeight: "500"
  },
  headerRight: {
    paddingTop: 4
  },
  sectionCard: {
    marginHorizontal: spacing.screenHorizontal,
    backgroundColor: colors.card,
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    padding: 16,
    gap: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2
  }
});
