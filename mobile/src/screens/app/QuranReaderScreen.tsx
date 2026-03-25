import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

const PASSAGES = [
  {
    title: "Al-Fatihah (1:1-7)",
    arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ...",
    translation: "In the name of Allah, the Most Compassionate, the Most Merciful."
  },
  {
    title: "Al-Ikhlas (112:1-4)",
    arabic: "قُلْ هُوَ ٱللَّهُ أَحَدٌ ...",
    translation: "Say, He is Allah, One."
  },
  {
    title: "Ayat al-Kursi (2:255)",
    arabic: "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ...",
    translation: "Allah - there is no deity except Him, the Ever-Living, the Sustainer."
  }
];

export function QuranReaderScreen() {
  const [index, setIndex] = useState(0);
  const current = PASSAGES[index];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Quran Reader</Text>
      <View style={styles.card}>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.arabic}>{current.arabic}</Text>
        <Text style={styles.translation}>{current.translation}</Text>
      </View>
      <View style={styles.row}>
        <Pressable
          style={styles.button}
          onPress={() => setIndex((value) => (value === 0 ? PASSAGES.length - 1 : value - 1))}
        >
          <Text style={styles.buttonText}>Previous</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => setIndex((value) => (value + 1) % PASSAGES.length)}>
          <Text style={styles.buttonText}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
    gap: 12
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700"
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    padding: 14,
    gap: 10
  },
  title: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600"
  },
  arabic: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 36
  },
  translation: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  }
});
