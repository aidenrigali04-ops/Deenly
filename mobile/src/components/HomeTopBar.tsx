import { Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supportsNativeBlur } from "../lib/blur-support";
import { colors } from "../theme";

type Props = {
  onPressCreate: () => void;
  onPressAlerts: () => void;
  onPressSearch?: () => void;
};

export function HomeTopBar({ onPressCreate, onPressAlerts, onPressSearch }: Props) {
  const insets = useSafeAreaInsets();
  const useBlur = supportsNativeBlur();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]} accessibilityRole="header">
      {useBlur ? (
        <BlurView intensity={72} tint="light" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
      )}
      <View style={styles.row}>
        <Pressable
          onPress={onPressCreate}
          style={styles.sideHit}
          accessibilityRole="button"
          accessibilityLabel="Create post"
        >
          <Text style={styles.plus}>+</Text>
        </Pressable>
        <Text style={styles.wordmark}>Deenly</Text>
        <View style={styles.rightCluster}>
          {onPressSearch ? (
            <Pressable
              onPress={onPressSearch}
              style={styles.sideHit}
              accessibilityRole="button"
              accessibilityLabel="Explore"
            >
              <Text style={styles.searchGlyph}>⌕</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onPressAlerts}
            style={styles.sideHit}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Text style={styles.heart}>♥</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.08)"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 1
  },
  rightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  sideHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  searchGlyph: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "500"
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
