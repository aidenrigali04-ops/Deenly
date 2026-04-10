import { useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors } from "../../theme";

const TOKENS = {
  inputFill: "#F5F4F2",
  border: "#EBEBEB",
  radius: 12,
  height: 48,
};

type Props = TextInputProps & {
  label?: string;
};

export function SoftTextInput({ label, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          style,
        ]}
        placeholderTextColor={colors.muted}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.muted,
  },
  input: {
    height: TOKENS.height,
    backgroundColor: TOKENS.inputFill,
    borderRadius: TOKENS.radius,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 0,
  },
  inputFocused: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
});
