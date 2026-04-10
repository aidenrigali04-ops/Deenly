import { Platform, StyleSheet, Switch, View, type SwitchProps } from "react-native";
import { colors, shadows } from "../theme";

type Props = SwitchProps;

/**
 * System Switch with accent track when on and a soft outer glow (iOS shadow / Android elevation).
 */
export function AccentSwitch({ value, style, ...rest }: Props) {
  return (
    <View style={[styles.wrap, value ? styles.wrapOn : null, style]}>
      <Switch
        value={value}
        trackColor={{ false: colors.surfaceSecondary, true: colors.accent }}
        thumbColor={Platform.OS === "android" ? colors.surface : undefined}
        ios_backgroundColor={colors.surfaceSecondary}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20
  },
  wrapOn: {
    ...Platform.select({
      ios: {
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 6
      },
      android: {
        ...shadows.switchGlowAndroid
      },
      default: {}
    })
  }
});
