import { Pressable, ScrollView, Text, View } from "react-native";
import { useCreateFlowTheme } from "../ui";

type ChipItem = {
  key: string;
  label: string;
};

type Props = {
  items: ChipItem[];
  selected: string;
  onSelect: (key: string) => void;
  /** If true, chips wrap instead of horizontal scroll */
  wrap?: boolean;
  /** `canvas` = chips on black background; `panel` = on white create cards */
  tone?: "panel" | "canvas";
};

export function ChipRow({ items, selected, onSelect, wrap, tone = "panel" }: Props) {
  const t = useCreateFlowTheme();
  const onCanvas = tone === "canvas";

  const content = items.map((item) => {
    const active = item.key === selected;
    return (
      <Pressable
        key={item.key}
        onPress={() => onSelect(item.key)}
        style={[
          onCanvas ? t.chipCanvas : t.chip,
          active && (onCanvas ? t.chipCanvasActive : t.chipActive)
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
      >
        <Text
          style={[
            onCanvas ? t.chipCanvasText : t.chipText,
            active && (onCanvas ? t.chipCanvasTextActive : t.chipTextActive)
          ]}
        >
          {item.label}
        </Text>
      </Pressable>
    );
  });

  if (wrap) {
    return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{content}</View>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={t.chipScrollRow}>
      {content}
    </ScrollView>
  );
}
