import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, type } from "../theme";

type SettingsRowProps = {
  title: string;
  subtitle?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Emphasize as a destructive action (e.g. log out). */
  destructive?: boolean;
  /** Hide trailing chevron when the action is not a drill-in. */
  showChevron?: boolean;
  /** @internal set by SettingsSection for last row */
  isLast?: boolean;
};

export function SettingsRow({
  title,
  subtitle,
  onPress,
  accessibilityLabel,
  destructive,
  showChevron = true,
  isLast
}: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !isLast && styles.rowBorder, pressed && styles.rowPressed]}
      android_ripple={{ color: "rgba(0,0,0,0.08)" }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, destructive && styles.rowTitleDestructive]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {showChevron ? (
        <Text style={styles.chevron} accessibilityElementsHidden>
          →
        </Text>
      ) : (
        <View style={styles.chevronSpacer} />
      )}
    </Pressable>
  );
}

type SettingsSectionProps = {
  title?: string;
  children: React.ReactNode;
};

export function SettingsSection({ title, children }: SettingsSectionProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
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
    ...type.sectionLabel,
    color: colors.muted,
    marginLeft: 4,
    marginBottom: 6
  },
  card: {
    borderRadius: radii.grouped,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    overflow: "hidden"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 18,
    minHeight: 52
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  rowPressed: {
    backgroundColor: colors.statePressed
  },
  rowText: {
    flex: 1,
    paddingRight: 14,
    gap: 3
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text,
    letterSpacing: -0.2
  },
  rowTitleDestructive: {
    color: colors.danger,
    fontWeight: "600"
  },
  rowSubtitle: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    letterSpacing: -0.1
  },
  chevron: {
    fontSize: 15,
    color: colors.muted,
    fontWeight: "400",
    marginTop: 1
  },
  chevronSpacer: { width: 16 }
});
