import { useState } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { useCreateFlowTheme } from "../ui";

type Props = TextInputProps & {
  label?: string;
  minHeight?: number;
};

export function SoftTextArea({ label, minHeight = 120, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const t = useCreateFlowTheme();

  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={t.fieldLabel}>{label}</Text> : null}
      <TextInput
        multiline
        textAlignVertical="top"
        style={[t.field, { minHeight, paddingVertical: 12 }, focused && t.fieldFocused, style]}
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
