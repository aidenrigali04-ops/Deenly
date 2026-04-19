import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCreateFlowTheme } from "../ui";

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
    minute: "2-digit"
  };
  return d.toLocaleString(undefined, opts);
}

export function DateTimePickerRow({
  label,
  value,
  onChange,
  optional,
  placeholder = "Tap to set"
}: Props) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const t = useCreateFlowTheme();
  const ink = t.f.createFlowInk ?? "#0A0A0B";
  const inkMuted = t.f.createFlowInkMuted ?? "rgba(10,10,11,0.55)";
  const inkMuted2 = t.f.createFlowInkMuted2 ?? "rgba(10,10,11,0.42)";

  const openPicker = () => {
    setPickerVisible(true);
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
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          minHeight: 48,
          gap: 10,
          paddingVertical: 8
        },
        pressed && { opacity: 0.72 }
      ]}
      accessibilityRole="button"
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "500" as const, color: ink }}>
          {label}
          {optional ? (
            <Text style={{ fontSize: 13, color: inkMuted, fontWeight: "400" as const }}> (optional)</Text>
          ) : null}
        </Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: "500" as const, color: value ? ink : inkMuted2 }}>
        {value ? formatDate(value) : placeholder}
      </Text>
      <Ionicons name="calendar-outline" size={18} color={inkMuted} />
    </Pressable>
  );
}
