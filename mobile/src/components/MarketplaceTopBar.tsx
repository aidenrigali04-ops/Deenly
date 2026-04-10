import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INK = "#0A0A0A";
const ICON = 24;

type Props = {
  onPressReels: () => void;
  onPressSearch: () => void;
  onPressNotifications: () => void;
};

/**
 * Marketplace chrome — wireframe-style top bar (reels · logo · search · alerts).
 */
export function MarketplaceTopBar({ onPressReels, onPressSearch, onPressNotifications }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        <Pressable
          onPress={onPressReels}
          style={styles.hit}
          accessibilityRole="button"
          accessibilityLabel="Reels"
        >
          <Ionicons name="play-circle-outline" size={ICON} color={INK} />
        </Pressable>
        <View style={styles.logoMark} accessibilityRole="header" accessibilityLabel="Deenly">
          <Ionicons name="arrow-up" size={20} color={INK} />
        </View>
        <View style={styles.right}>
          <Pressable onPress={onPressSearch} style={styles.hit} accessibilityRole="button" accessibilityLabel="Search">
            <Ionicons name="search-outline" size={ICON} color={INK} />
          </Pressable>
          <Pressable
            onPress={onPressNotifications}
            style={styles.hit}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={ICON} color={INK} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: INK
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
    minHeight: 48
  },
  hit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: INK,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  }
});
