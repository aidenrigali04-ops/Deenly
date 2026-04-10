import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

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
};

export function ChipRow({ items, selected, onSelect, wrap }: Props) {
  const content = items.map((item) => {
    const active = item.key === selected;
    return (
      <Pressable
        key={item.key}
        onPress={() => onSelect(item.key)}
        style={[styles.chip, active && styles.chipActive]}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]}>
          {item.label}
        </Text>
      </Pressable>
    );
  });

  if (wrap) {
    return <View style={styles.wrapRow}>{content}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  wrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 0,
  },
  chipActive: {
    backgroundColor: colors.accentMuted,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.muted,
  },
  chipTextActive: {
    fontWeight: "600",
    color: colors.accent,
  },
});
