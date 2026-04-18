import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAppChrome } from "../lib/use-app-chrome";

/**
 * Full-screen gradient behind tab scenes — dark or light signed-in canvas.
 */
export function AtmosphereBackdrop() {
  const { atmosphere } = useAppChrome();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[...atmosphere.colors]}
        start={atmosphere.start}
        end={atmosphere.end}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
