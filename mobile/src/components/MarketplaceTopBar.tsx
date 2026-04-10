import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INK = "#0F0E0D";
const HAIRLINE = "#EBEBEB";
const ICON = 24;

type Props = {
  onPressReels: () => void;
  onPressSearch: () => void;
  onPressNotifications: () => void;
};

/**
 * Marketplace chrome — top bar: reels icon · center logo · search + bell.
 */
export function MarketplaceTopBar({ onPressReels, onPressSearch, onPressNotifications }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {/* Reels icon — rounded square with play triangle */}
        <Pressable
          onPress={onPressReels}
          style={styles.hit}
          accessibilityRole="button"
          accessibilityLabel="Reels"
        >
          <View style={styles.reelsBox}>
            <Ionicons name="play" size={14} color={INK} style={{ marginLeft: 1 }} />
          </View>
        </Pressable>

        {/* Center logo mark — rounded square with Deenly icon */}
        <View style={styles.logoMark} accessibilityRole="header" accessibilityLabel="Deenly">
          <Ionicons name="diamond-outline" size={20} color={INK} />
        </View>

        {/* Right: search + bell */}
        <View style={styles.right}>
          <Pressable
            onPress={onPressSearch}
            style={styles.hit}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
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
    borderBottomColor: HAIRLINE
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 56
  },
  hit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  reelsBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: "center",
    justifyContent: "center"
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  }
});
