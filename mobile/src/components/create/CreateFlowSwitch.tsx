import { Platform, StyleSheet, Switch, View, type SwitchProps } from "react-native";
import { useCreateFlowTheme } from "../ui";

type Props = SwitchProps;

/** Create-flow switch using Figma kit track colors (not legacy `colors.accent`). */
export function CreateFlowSwitch({ value, style, ...rest }: Props) {
  const { f } = useCreateFlowTheme();

  return (
    <View
      style={[
        styles.wrap,
        value && Platform.OS === "ios"
          ? {
              shadowColor: f.accentGold,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 6
            }
          : null,
        style
      ]}
    >
      <Switch
        value={value}
        trackColor={{ false: f.glassSoft, true: f.accentGold }}
        thumbColor={Platform.OS === "android" ? f.card : undefined}
        ios_backgroundColor={f.glassSoft}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20
  }
});
