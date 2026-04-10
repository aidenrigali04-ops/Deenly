import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

type Props = {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
};

export function SubtypeSegmentedControl({ options, value, onChange }: Props) {
  return (
    <View style={styles.track}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.pill, active && styles.pillActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.text, active && styles.textActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: "#F5F4F2",
    borderRadius: 999,
    padding: 3,
    gap: 4,
  },
  pill: {
    flex: 1,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: {
    backgroundColor: colors.accentMuted,
  },
  text: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.muted,
  },
  textActive: {
    fontWeight: "600",
    color: colors.accent,
  },
});
