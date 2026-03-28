import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

const storySeeds = [
  { id: "my-story", label: "Your story", initials: "+", isOwn: true },
  { id: "s1", label: "QuranDaily", initials: "QD", isOwn: false },
  { id: "s2", label: "UpliftHub", initials: "UH", isOwn: false },
  { id: "s3", label: "SunnahPath", initials: "SP", isOwn: false },
  { id: "s4", label: "MercyNotes", initials: "MN", isOwn: false }
];

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
                  ? [colors.accent, "#A78BFA", "#F472B6"]
                  : [colors.accent, "#38BDF8", "#4ADE80"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ringOuter}
            >
              <View style={styles.ringInner}>
                <Text style={styles.initials}>{story.initials}</Text>
              </View>
            </LinearGradient>
            <Text style={styles.label} numberOfLines={1}>
              {story.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const RING = 64;

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 4
  },
  chip: {
    alignItems: "center",
    width: 72,
    marginRight: 12
  },
  ringOuter: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    padding: 3,
    alignItems: "center",
    justifyContent: "center"
  },
  ringInner: {
    width: RING - 6,
    height: RING - 6,
    borderRadius: (RING - 6) / 2,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  initials: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  label: {
    marginTop: 6,
    maxWidth: 68,
    fontSize: 11,
    color: colors.muted,
    textAlign: "center"
  }
});
