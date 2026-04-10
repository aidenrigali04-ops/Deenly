import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const INK = "#0A0A0A";

type Props = {
  onPressSearch: () => void;
  followingOnly: boolean;
  onSetFollowingOnly: (value: boolean) => void;
  onPressNearMe: () => void;
  onPressEvents: () => void;
  onPressCreatorHub?: () => void;
  showCreatorHub?: boolean;
};

/**
 * Search strip + filter pills inside a bordered panel (mockup-style marketplace header).
 */
export function MarketplaceFeedPanel({
  onPressSearch,
  followingOnly,
  onSetFollowingOnly,
  onPressNearMe,
  onPressEvents,
  onPressCreatorHub,
  showCreatorHub
}: Props) {
  return (
    <View style={styles.panel}>
      <LinearGradient
        colors={["#FDE047", "#FB7185", "#C084FC", "#60A5FA"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.searchGradient}
      >
        <Pressable
          style={styles.searchInner}
          onPress={onPressSearch}
          accessibilityRole="search"
          accessibilityLabel="Search products, people, and places"
        >
          <Text style={styles.searchPlaceholder}>Search products, people, places</Text>
        </Pressable>
      </LinearGradient>

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

      {showCreatorHub && onPressCreatorHub ? (
        <Pressable onPress={onPressCreatorHub} style={styles.hubLink}>
          <Text style={styles.hubLinkText}>Creator hub · sell on Deenly</Text>
        </Pressable>
      ) : null}
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
  searchGradient: {
    borderRadius: 999,
    padding: 2,
    alignSelf: "stretch"
  },
  searchInner: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    minHeight: 48,
    paddingHorizontal: 18,
    justifyContent: "center"
  },
  searchPlaceholder: {
    fontSize: 15,
    color: "rgba(10,10,10,0.45)",
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
  hubLink: {
    alignSelf: "flex-start",
    paddingVertical: 2
  },
  hubLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(10,10,10,0.55)",
    textDecorationLine: "underline"
  }
});
