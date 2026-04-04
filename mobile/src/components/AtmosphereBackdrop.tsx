import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { atmosphereGradient } from "../theme";

/**
 * Full-screen soft gradient behind transparent tab scenes (glass / liquid-style depth).
 */
export function AtmosphereBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[...atmosphereGradient.colors]}
        start={atmosphereGradient.start}
        end={atmosphereGradient.end}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
