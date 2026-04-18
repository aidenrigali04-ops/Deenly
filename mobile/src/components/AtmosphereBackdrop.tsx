import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { figmaAtmosphere } from "../theme";

/**
 * Full-screen gradient behind tab scenes — matches Figma dark social canvas.
 */
export function AtmosphereBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[...figmaAtmosphere.colors]}
        start={figmaAtmosphere.start}
        end={figmaAtmosphere.end}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
