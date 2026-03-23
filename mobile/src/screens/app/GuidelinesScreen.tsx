import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

const guidelines = [
  "Share content that increases beneficial knowledge and sincere reminders.",
  "Avoid haram media, misinformation, harassment, and sectarian hostility.",
  "Use respectful language and assume good intent in disagreements.",
  "Report concerning content with clear context and evidence when available.",
  "Protect privacy. Do not post private conversations or personal data."
];

export function GuidelinesScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Community Guidelines</Text>
      <View style={styles.card}>
        {guidelines.map((item) => (
          <Text key={item} style={styles.item}>
            - {item}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 10
  },
  item: {
    color: colors.text,
    lineHeight: 20
  }
});
