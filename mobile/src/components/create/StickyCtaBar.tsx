import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme";

type Props = {
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
};

export function StickyCtaBar({
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  secondaryLabel,
  onSecondary,
  secondaryDisabled,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Pressable
        onPress={onPrimary}
        disabled={primaryDisabled || primaryLoading}
        style={({ pressed }) => [
          styles.primary,
          (primaryDisabled || primaryLoading) && styles.primaryDisabled,
          pressed && styles.pressed,
        ]}
      >
        {primaryLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryText}>{primaryLabel}</Text>
        )}
      </Pressable>
      {secondaryLabel && onSecondary ? (
        <Pressable
          onPress={onSecondary}
          disabled={secondaryDisabled}
          style={({ pressed }) => [
            styles.secondary,
            secondaryDisabled && styles.secondaryDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#F9F8F6",
    borderTopWidth: 1,
    borderTopColor: "#EBEBEB",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  primary: {
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryDisabled: {
    backgroundColor: "rgba(16, 85, 219, 0.35)",
  },
  primaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondary: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryDisabled: {
    opacity: 0.5,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.accent,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.995 }],
  },
});
