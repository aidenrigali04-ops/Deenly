import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const storySeeds = [
  { id: "my-story", label: "Your story", initials: "+", isOwn: true },
  { id: "s1", label: "QuranDaily", initials: "QD", isOwn: false },
  { id: "s2", label: "UpliftHub", initials: "UH", isOwn: false },
  { id: "s3", label: "SunnahPath", initials: "SP", isOwn: false },
  { id: "s4", label: "MercyNotes", initials: "MN", isOwn: false }
];

/** Circle sizes */
const RING_OUTER = 72;
const RING_BORDER = 2.5;
const RING_GAP = 2;
const AVATAR_SIZE = RING_OUTER - (RING_BORDER + RING_GAP) * 2;

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
              /* Add-story circle: dashed border with "+" */
              <View style={styles.addRing}>
                <Text style={styles.addPlus}>+</Text>
              </View>
            ) : (
              /* Other stories: gradient ring (warm pink-to-yellow) */
              <LinearGradient
                colors={["#F9CE34", "#EE2A7B", "#6228D7"]}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientRing}
              >
                <View style={styles.avatarInner}>
                  <Text style={styles.initials}>{story.initials}</Text>
                </View>
              </LinearGradient>
            )}
            <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
              {story.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  chip: {
    alignItems: "center",
    width: 76
  },
  addRing: {
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
    borderWidth: 2,
    borderColor: "#8A8480",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  addPlus: {
    fontSize: 28,
    fontWeight: "300",
    color: "#8A8480",
    marginTop: -1
  },
  gradientRing: {
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
    padding: RING_BORDER + RING_GAP,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarInner: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center"
  },
  initials: {
    color: "#0F0E0D",
    fontSize: 15,
    fontWeight: "600"
  },
  label: {
    marginTop: 6,
    maxWidth: 72,
    fontSize: 11,
    color: "#8A8480",
    textAlign: "center",
    fontWeight: "500"
  }
});
