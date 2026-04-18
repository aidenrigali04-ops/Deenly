import { StyleSheet, Text, TextInput, type StyleProp } from "react-native";
import { fonts } from "../theme";

let applied = false;

type LegacyDefaultProps = { defaultProps?: { style?: StyleProp<object> } };

/** Call once after Urbanist `useFonts` succeeds — baseline for Text/TextInput without explicit `fontFamily`. */
export function applyUrbanistTextDefaults() {
  if (applied) {
    return;
  }
  applied = true;
  const base = { fontFamily: fonts.regular };
  const T = Text as unknown as LegacyDefaultProps;
  T.defaultProps = T.defaultProps ?? {};
  T.defaultProps.style = StyleSheet.compose(T.defaultProps.style, base);
  const TI = TextInput as unknown as LegacyDefaultProps;
  TI.defaultProps = TI.defaultProps ?? {};
  TI.defaultProps.style = StyleSheet.compose(TI.defaultProps.style, base);
}
