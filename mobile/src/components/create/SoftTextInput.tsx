import { useState } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { useCreateFlowTheme } from "../ui";

type Props = TextInputProps & {
  label?: string;
};

export function SoftTextInput({ label, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const t = useCreateFlowTheme();

  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={t.fieldLabel}>{label}</Text> : null}
      <TextInput
        style={[t.field, focused && t.fieldFocused, style]}
        placeholderTextColor={t.placeholderColor}
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
