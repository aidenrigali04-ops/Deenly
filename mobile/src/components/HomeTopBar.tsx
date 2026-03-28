import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";

type Props = {
  onPressCreate: () => void;
  onPressAlerts: () => void;
};

export function HomeTopBar({ onPressCreate, onPressAlerts }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <Pressable
        onPress={onPressCreate}
        style={styles.sideHit}
        accessibilityRole="button"
        accessibilityLabel="Create post"
      >
        <Text style={styles.plus}>+</Text>
      </Pressable>
      <Text style={styles.wordmark} accessibilityRole="header">
        Deenly
      </Text>
      <Pressable
        onPress={onPressAlerts}
        style={styles.sideHit}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
      >
        <Text style={styles.heart}>♥</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  sideHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  plus: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32
  },
  wordmark: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5
  },
  heart: {
    color: colors.text,
    fontSize: 22
  }
});
