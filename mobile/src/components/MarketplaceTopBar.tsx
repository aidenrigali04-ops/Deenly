import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { figmaMobile, figmaMobileHome, type } from "../theme";

const ICON = 22;
const INK = figmaMobile.text;

type Props = {
  onPressReels: () => void;
  onPressSearch: () => void;
  onPressNotifications: () => void;
};

/**
 * Marketplace chrome — matches Home social header: reels · Market · search + alerts.
 */
export function MarketplaceTopBar({ onPressReels, onPressSearch, onPressNotifications }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + figmaMobileHome.headerPadVTop }]}>
      <View style={styles.row}>
        <Pressable
          onPress={onPressReels}
          style={({ pressed }) => [styles.iconWell, pressed && styles.iconWellPressed]}
          accessibilityRole="button"
          accessibilityLabel="Reels"
        >
          <Ionicons name="play" size={15} color={INK} style={{ marginLeft: 1 }} />
        </Pressable>

        <Text style={styles.title} accessibilityRole="header">
          Market
        </Text>

        <View style={styles.right}>
          <Pressable
            onPress={onPressSearch}
            style={({ pressed }) => [styles.iconWell, pressed && styles.iconWellPressed]}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Ionicons name="search-outline" size={ICON} color={INK} />
          </Pressable>
          <Pressable
            onPress={onPressNotifications}
            style={({ pressed }) => [styles.iconWell, pressed && styles.iconWellPressed]}
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
    backgroundColor: "transparent",
    borderBottomWidth: 0
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: figmaMobileHome.pagePadH,
    paddingBottom: figmaMobileHome.headerPadVBottom,
    minHeight: 48
  },
  iconWell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 8, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 28
      },
      android: { elevation: 2 },
      default: {}
    })
  },
  iconWellPressed: {
    opacity: 0.85
  },
  title: {
    ...type.navChromeTitle,
    color: INK,
    letterSpacing: -0.45
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  }
});
