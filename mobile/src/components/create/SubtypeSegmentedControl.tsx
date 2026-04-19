import { Pressable, Text, View } from "react-native";
import { useCreateFlowTheme } from "../ui";

type Props = {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
};

export function SubtypeSegmentedControl({ options, value, onChange }: Props) {
  const t = useCreateFlowTheme();

  return (
    <View style={t.segmentTrackPanel}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[t.segmentPill, active ? t.segmentPillActive : t.segmentPillIdle]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={active ? t.segmentTextActive : t.segmentTextIdlePanel}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
