import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "../theme";

const storySeeds = [
  { id: "my-story", label: "Your story", initials: "+", isOwn: true },
  { id: "s1", label: "QuranDaily", initials: "QD", isOwn: false },
  { id: "s2", label: "UpliftHub", initials: "UH", isOwn: false },
  { id: "s3", label: "SunnahPath", initials: "SP", isOwn: false },
  { id: "s4", label: "MercyNotes", initials: "MN", isOwn: false }
];

/** Ring diameter — spec 68–72 */
const RING = 70;
const RING_PAD = 3;

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
            <LinearGradient
              colors={
                story.isOwn
                  ? ["#4b5563", "#9ca3af", "#d8b4c4"]
                  : ["#5b8a9e", "#7eb8c8", "#86b89a"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ringOuter}
            >
              <View style={styles.ringInner}>
                <Text style={styles.initials}>{story.initials}</Text>
              </View>
            </LinearGradient>
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
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    paddingVertical: 12,
    paddingHorizontal: spacing.pagePaddingH - 8
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 6,
    gap: 4
  },
  chip: {
    alignItems: "center",
    width: 76,
    marginRight: 8
  },
  ringOuter: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    padding: RING_PAD,
    alignItems: "center",
    justifyContent: "center"
  },
  ringInner: {
    width: RING - RING_PAD * 2,
    height: RING - RING_PAD * 2,
    borderRadius: (RING - RING_PAD * 2) / 2,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  initials: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600"
  },
  label: {
    marginTop: 6,
    maxWidth: 72,
    fontSize: 12,
    color: colors.mutedLight,
    textAlign: "center"
  }
});
