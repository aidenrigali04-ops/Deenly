import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

export type PostingType = "post" | "product" | "event" | "reel";

type Props = {
  value: PostingType;
  onChange: (type: PostingType) => void;
  options?: PostingType[];
};

const LABELS: Record<PostingType, string> = {
  post: "Post",
  product: "Product",
  event: "Event",
  reel: "Reel",
};

export function PostingTypeSegmentedControl({
  value,
  onChange,
  options = ["post", "product", "event", "reel"],
}: Props) {
  return (
    <View style={styles.track}>
      {options.map((type) => {
        const active = type === value;
        return (
          <Pressable
            key={type}
            onPress={() => onChange(type)}
            style={[styles.pill, active && styles.pillActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>
              {LABELS[type]}
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
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    padding: 4,
    gap: 8,
  },
  pill: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  pillActive: {
    backgroundColor: colors.accentMuted,
    ...Platform.select({
      ios: {
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  pillText: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.muted,
  },
  pillTextActive: {
    fontWeight: "600",
    color: colors.accent,
  },
});
