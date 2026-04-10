import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme";

const TOKENS = {
  hairline: "#EBEBEB",
  bg: "#F9F8F6",
};

type Props = {
  title: string;
  onBack: () => void;
  draftLabel?: string;
  onDraft?: () => void;
};

export function CreateAppBar({ title, onBack, draftLabel, onDraft }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {draftLabel && onDraft ? (
          <Pressable
            onPress={onDraft}
            hitSlop={8}
            style={({ pressed }) => [styles.draftBtn, pressed && styles.pressed]}
          >
            <Text style={styles.draftText}>{draftLabel}</Text>
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
      <View style={styles.hairline} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: TOKENS.bg,
  },
  row: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  iconBtn: {
    width: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
    letterSpacing: -0.3,
  },
  draftBtn: {
    width: 40,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  draftText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accent,
  },
  hairline: {
    height: 1,
    backgroundColor: TOKENS.hairline,
  },
  pressed: {
    opacity: 0.7,
  },
});
