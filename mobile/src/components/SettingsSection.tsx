import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

type SettingsRowProps = {
  title: string;
  subtitle?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** @internal set by SettingsSection for last row */
  isLast?: boolean;
};

export function SettingsRow({ title, subtitle, onPress, accessibilityLabel, isLast }: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !isLast && styles.rowBorder, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.chevron} accessibilityElementsHidden>
        ›
      </Text>
    </Pressable>
  );
}

type SettingsSectionProps = {
  title: string;
  children: React.ReactNode;
};

export function SettingsSection({ title, children }: SettingsSectionProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {React.Children.map(items, (child, index) => {
          if (!React.isValidElement(child)) {
            return child;
          }
          const isLast = index === items.length - 1;
          if (child.type !== SettingsRow) {
            return child;
          }
          return React.cloneElement(child as React.ReactElement<SettingsRowProps>, { isLast });
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginLeft: 4
  },
  card: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  rowPressed: {
    backgroundColor: colors.surface
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
    gap: 2
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text
  },
  rowSubtitle: {
    fontSize: 13,
    color: colors.muted
  },
  chevron: {
    fontSize: 22,
    color: colors.muted,
    fontWeight: "300"
  }
});
