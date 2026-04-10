import { Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";

type Props = {
  label?: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
};

export function AIHelperRow({
  label = "Improve with AI",
  onPress,
  busy,
  disabled,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        styles.row,
        (busy || disabled) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
      <Text style={styles.label}>{busy ? "Working..." : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.accent,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
