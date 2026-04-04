import { StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { supportsNativeBlur } from "../lib/blur-support";
import { colors } from "../theme";

const BORDER = "rgba(0, 0, 0, 0.08)";

/**
 * Frosted tab bar (native blur on iOS dev/standalone only; Expo Go / Android / web use fill).
 */
export function TabBarGlassBackground() {
  const useBlur = supportsNativeBlur();
  return (
    <View style={styles.wrap} pointerEvents="none">
      {useBlur ? (
        <BlurView intensity={58} tint="light" style={StyleSheet.absoluteFill} />
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
