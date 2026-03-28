import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
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
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 8
      },
      android: { elevation: 2 }
    })
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
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4
  },
  heart: {
    color: colors.text,
    fontSize: 22
  }
});
