import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { colors } from "../theme";

const BORDER = "rgba(0, 0, 0, 0.08)";

/**
 * Frosted tab bar (iOS blur + Android translucent fallback).
 */
export function TabBarGlassBackground() {
  const useBlur = Platform.OS === "ios" || Platform.OS === "web";
  return (
    <View style={styles.wrap} pointerEvents="none">
      {useBlur ? (
        <BlurView intensity={Platform.OS === "web" ? 40 : 58} tint="light" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFillStrong }]} />
      )}
      <View style={styles.topHairline} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  topHairline: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER
  }
});
