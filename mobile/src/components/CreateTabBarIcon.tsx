import { useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppChrome } from "../lib/use-app-chrome";

type Props = {
  focused: boolean;
};

/**
 * Figma Social Media App UI — bottom tab bar (node 1-209): center action is a **filled disc**
 * with a **bold plus**, lifted above the pill; not the same glass frame as other tabs.
 */
export function CreateTabBarIcon({ focused }: Props) {
  const { nav } = useAppChrome();
  const dial = nav.createFabDiameter;
  const plusSize = Math.round(dial * 0.5);

  const fabStyle = useMemo(
    () => [
      styles.fab,
      {
        width: dial,
        height: dial,
        borderRadius: dial / 2,
        backgroundColor: nav.createFabFill,
        borderWidth: nav.createFabBorderWidth,
        borderColor: nav.createFabBorderColor,
        transform: [{ scale: focused ? 1.05 : 1 }],
        ...Platform.select({
          ios: {
            shadowColor: nav.createFabShadowColorIOS,
            shadowOffset: { width: 0, height: nav.createFabShadowOffsetYIOS },
            shadowOpacity: nav.createFabShadowOpacityIOS,
            shadowRadius: nav.createFabShadowRadiusIOS
          },
          android: {
            elevation: nav.createFabElevationAndroid
          },
          default: {}
        })
      }
    ],
    [dial, focused, nav]
  );

  return (
    <View style={[styles.lift, { marginTop: nav.createFabOverlapTop }]} accessibilityRole="image" accessibilityLabel="Create">
      <View style={fabStyle}>
        <Ionicons name="add" size={plusSize} color={nav.createFabIconColor} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lift: {
    alignItems: "center",
    justifyContent: "center"
  },
  fab: {
    alignItems: "center",
    justifyContent: "center"
  }
});
