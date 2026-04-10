import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";

type Props = {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  optional?: boolean;
  placeholder?: string;
};

function formatDate(d: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  return d.toLocaleString(undefined, opts);
}

export function DateTimePickerRow({
  label,
  value,
  onChange,
  optional,
  placeholder = "Tap to set",
}: Props) {
  const [pickerVisible, setPickerVisible] = useState(false);

  const openPicker = () => {
    // On mobile we use the native date picker approach.
    // For simplicity we toggle a state that parents can use,
    // or we provide a basic text-based fallback.
    setPickerVisible(true);
    // Provide a default date if none set
    if (!value) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);
      onChange(tomorrow);
    }
  };

  return (
    <Pressable
      onPress={openPicker}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={styles.labelWrap}>
        <Text style={styles.label}>
          {label}
          {optional ? <Text style={styles.optional}> (optional)</Text> : null}
        </Text>
      </View>
      <Text style={[styles.value, !value && styles.placeholder]}>
        {value ? formatDate(value) : placeholder}
      </Text>
      <Ionicons name="calendar-outline" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    gap: 10,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  labelWrap: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.text,
  },
  optional: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "400",
  },
  value: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "500",
  },
  placeholder: {
    color: colors.muted,
  },
});
