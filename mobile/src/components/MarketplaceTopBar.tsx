import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveFigmaMobileHome, type } from "../theme";
import { useAppChrome } from "../lib/use-app-chrome";

const ICON = 22;

type Props = {
  onPressReels: () => void;
  onPressSearch: () => void;
  onPressNotifications: () => void;
};

function buildRowStyles(fh: ReturnType<typeof resolveFigmaMobileHome>) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: "transparent",
      borderBottomWidth: 0
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: fh.pagePadH,
      paddingBottom: fh.headerPadVBottom,
      minHeight: 48
    },
    iconWell: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
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
      letterSpacing: -0.45
    },
    right: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    }
  });
}

/**
 * Marketplace chrome — matches Home social header: reels · Market · search + alerts.
 */
export function MarketplaceTopBar({ onPressReels, onPressSearch, onPressNotifications }: Props) {
  const { figma: fm, figmaHome: fh } = useAppChrome();
  const styles = useMemo(() => buildRowStyles(fh), [fh]);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + fh.headerPadVTop }]}>
      <View style={styles.row}>
        <Pressable
          onPress={onPressReels}
          style={({ pressed }) => [
            styles.iconWell,
            { backgroundColor: fm.glassSoft, borderColor: fm.glassBorderSoft },
            pressed && styles.iconWellPressed
          ]}
          accessibilityRole="button"
          accessibilityLabel="Reels"
        >
          <Ionicons name="play" size={15} color={fm.text} style={{ marginLeft: 1 }} />
        </Pressable>

        <Text style={[styles.title, { color: fm.text }]} accessibilityRole="header">
          Market
        </Text>

        <View style={styles.right}>
          <Pressable
            onPress={onPressSearch}
            style={({ pressed }) => [
              styles.iconWell,
              { backgroundColor: fm.glassSoft, borderColor: fm.glassBorderSoft },
              pressed && styles.iconWellPressed
            ]}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Ionicons name="search-outline" size={ICON} color={fm.text} />
          </Pressable>
          <Pressable
            onPress={onPressNotifications}
            style={({ pressed }) => [
              styles.iconWell,
              { backgroundColor: fm.glassSoft, borderColor: fm.glassBorderSoft },
              pressed && styles.iconWellPressed
            ]}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={ICON} color={fm.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
