import { Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supportsNativeBlur } from "../lib/blur-support";
import { colors, type as typeStyles } from "../theme";

const ICON_SIZE = 24;
const ICON_COLOR = colors.text;

type Props = {
  onPressCreate: () => void;
  onPressAlerts: () => void;
  onPressSearch?: () => void;
};

export function HomeTopBar({ onPressCreate, onPressAlerts, onPressSearch }: Props) {
  const insets = useSafeAreaInsets();
  const useBlur = supportsNativeBlur();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]} accessibilityRole="header">
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
          accessibilityLabel="Create"
        >
          <Ionicons name="add-circle-outline" size={ICON_SIZE} color={ICON_COLOR} />
        </Pressable>
        <Text style={styles.wordmark}>Deenly</Text>
        <View style={styles.rightCluster}>
          {onPressSearch ? (
            <Pressable
              onPress={onPressSearch}
              style={styles.sideHit}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <Ionicons name="search-outline" size={ICON_SIZE} color={ICON_COLOR} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onPressAlerts}
            style={styles.sideHit}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={ICON_SIZE} color={ICON_COLOR} />
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
    borderBottomColor: colors.border
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    minHeight: 44,
    zIndex: 1
  },
  rightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  sideHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  wordmark: {
    color: colors.text,
    ...typeStyles.navChromeTitle
  }
});
