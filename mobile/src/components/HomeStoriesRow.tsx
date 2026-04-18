import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { figmaMobile } from "../theme";

const storySeeds = [
  { id: "my-story", label: "Your story", initials: "+", isOwn: true },
  { id: "s1", label: "Name 1", initials: "QD", isOwn: false },
  { id: "s2", label: "Name 2", initials: "UH", isOwn: false },
  { id: "s3", label: "Name 3", initials: "SP", isOwn: false },
  { id: "s4", label: "Name 4", initials: "MN", isOwn: false }
];

/** Figma home — 70px story rings on dark canvas */
const RING_OUTER = 70;
const AVATAR_SIZE = 64;

export function HomeStoriesRow() {
  return (
    <View style={styles.section} accessibilityRole="summary" accessibilityLabel="Stories">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {storySeeds.map((story) => (
          <Pressable
            key={story.id}
            style={styles.chip}
            accessibilityRole="button"
            accessibilityLabel={story.label}
          >
            {story.isOwn ? (
              <View style={styles.addRing}>
                <Text style={styles.addPlus}>+</Text>
              </View>
            ) : (
              <View style={styles.storyRing}>
                <View style={styles.avatarInner}>
                  <Text style={styles.initials}>{story.initials}</Text>
                </View>
              </View>
            )}
            <View style={styles.labelRow}>
              <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
                {story.label}
              </Text>
              {!story.isOwn ? (
                <Ionicons name="checkmark-circle" size={12} color={figmaMobile.text} />
              ) : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "transparent",
    paddingVertical: 4,
    paddingHorizontal: 0
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  chip: {
    alignItems: "center",
    width: 78
  },
  addRing: {
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: figmaMobile.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: figmaMobile.glassSoft
  },
  addPlus: {
    fontSize: 28,
    fontWeight: "300",
    color: figmaMobile.text,
    marginTop: -1
  },
  storyRing: {
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
    padding: (RING_OUTER - AVATAR_SIZE) / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: figmaMobile.text,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)"
  },
  avatarInner: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: figmaMobile.text,
    alignItems: "center",
    justifyContent: "center"
  },
  initials: {
    color: figmaMobile.avatarInitialInk,
    fontSize: 15,
    fontWeight: "600"
  },
  label: {
    maxWidth: 62,
    fontSize: 12,
    color: figmaMobile.text,
    textAlign: "center",
    fontWeight: "500"
  },
  labelRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    maxWidth: 76
  }
});
