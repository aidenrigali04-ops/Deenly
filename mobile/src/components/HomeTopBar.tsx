import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveFigmaMobile, type as typeStyles } from "../theme";
import { useAppChrome } from "../lib/use-app-chrome";

const ICON_SIZE = 22;

type Props = {
  onPressReels: () => void;
  onPressAlerts: () => void;
  onPressSearch?: () => void;
};

export function HomeTopBar({ onPressReels, onPressAlerts, onPressSearch }: Props) {
  const insets = useSafeAreaInsets();
  const { figma } = useAppChrome();
  const styles = useMemo(() => buildStyles(figma), [figma]);
  const iconColor = figma.text;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 4 }]} accessibilityRole="header">
      <View style={styles.row}>
        <Pressable
          onPress={onPressReels}
          style={({ pressed }) => [styles.iconWell, pressed && styles.iconWellPressed]}
          accessibilityRole="button"
          accessibilityLabel="Reels"
        >
          <Ionicons name="play" size={15} color={iconColor} style={{ marginLeft: 1 }} />
        </Pressable>
        <Text style={styles.wordmark}>Deenly</Text>
        <View style={styles.rightCluster}>
          {onPressSearch ? (
            <Pressable
              onPress={onPressSearch}
              style={({ pressed }) => [styles.iconWell, pressed && styles.iconWellPressed]}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <Ionicons name="search-outline" size={ICON_SIZE} color={iconColor} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onPressAlerts}
            style={({ pressed }) => [styles.iconWell, pressed && styles.iconWellPressed]}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={ICON_SIZE} color={iconColor} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function buildStyles(fig: ReturnType<typeof resolveFigmaMobile>) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: "transparent",
      borderBottomWidth: 0
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 10,
      minHeight: 48,
      zIndex: 1
    },
    rightCluster: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    iconWell: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: fig.glassSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: fig.glassBorderSoft,
      alignItems: "center",
      justifyContent: "center"
    },
    iconWellPressed: {
      opacity: 0.85
    },
    wordmark: {
      color: fig.text,
      ...typeStyles.navChromeTitle,
      letterSpacing: -0.45
    }
  });
}
