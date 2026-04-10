import { Pressable, StyleSheet, Text, View } from "react-native";

const INK = "#0A0A0A";

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
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: INK,
    padding: 16,
    gap: 14
  },
  searchBar: {
    backgroundColor: "#F5F4F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EBEBEB",
    height: 48,
    paddingHorizontal: 18,
    justifyContent: "center",
    alignSelf: "stretch"
  },
  searchPlaceholder: {
    fontSize: 15,
    color: "#8A8480",
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
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: INK,
    backgroundColor: "#FFFFFF"
  },
  chipSelected: {
    backgroundColor: INK,
    borderColor: INK
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: INK
  },
  chipTextOnDark: {
    color: "#FFFFFF"
  },
});
