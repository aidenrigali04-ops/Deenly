import { Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCreateFlowTheme } from "../ui";

type Props = {
  label?: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
};

export function AIHelperRow({ label = "Improve with AI", onPress, busy, disabled }: Props) {
  const t = useCreateFlowTheme();
  const off = busy || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, minHeight: 44 },
        off && { opacity: 0.45 },
        pressed && !off && { opacity: 0.75 }
      ]}
    >
      <Ionicons name="sparkles-outline" size={18} color={t.f.accentGold} />
      <Text style={{ fontSize: 14, fontWeight: "600" as const, color: t.f.accentGold }}>{busy ? "Working…" : label}</Text>
    </Pressable>
  );
}
