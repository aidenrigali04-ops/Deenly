import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

type Props = {
  onPressSearch: () => void;
  followingOnly: boolean;
  onSetFollowingOnly: (value: boolean) => void;
  onPressNearMe: () => void;
  onPressEvents: () => void;
};

/**
 * Search strip + filter pills inside a bordered panel (mockup-style marketplace header).
 */
export function MarketplaceFeedPanel({
  onPressSearch,
  followingOnly,
  onSetFollowingOnly,
  onPressNearMe,
  onPressEvents
}: Props) {
  return (
    <View style={styles.panel}>
      <Pressable
        style={styles.searchBar}
        onPress={onPressSearch}
        accessibilityRole="search"
        accessibilityLabel="Search products, people, and places"
      >
        <Text style={styles.searchPlaceholder}>Search products, people, places</Text>
      </Pressable>

      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, !followingOnly && styles.chipSelected]}
          onPress={() => onSetFollowingOnly(false)}
        >
          <Text style={[styles.chipText, !followingOnly && styles.chipTextOnDark]}>All</Text>
        </Pressable>
        <Pressable
          style={[styles.chip, followingOnly && styles.chipSelected]}
          onPress={() => onSetFollowingOnly(true)}
        >
          <Text style={[styles.chipText, followingOnly && styles.chipTextOnDark]}>Following</Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={onPressNearMe}>
          <Text style={styles.chipText}>Near me</Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={onPressEvents}>
          <Text style={styles.chipText}>Events</Text>
        </Pressable>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: radii.feedCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    padding: 16,
    gap: 14
  },
  searchBar: {
    backgroundColor: colors.surfaceField,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    height: 48,
    paddingHorizontal: 18,
    justifyContent: "center",
    alignSelf: "stretch"
  },
  searchPlaceholder: {
    fontSize: 15,
    color: colors.muted,
    fontWeight: "500"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text
  },
  chipTextOnDark: {
    color: colors.onAccent
  },
});
