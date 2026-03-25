import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

const STORAGE_KEY = "deenly_mobile_dhikr_count_v1";

export function DhikrScreen() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= 0) {
          setCount(parsed);
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, String(count)).catch(() => null);
  }, [count]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Dhikr Counter</Text>
      <Text style={styles.subtle}>Tap to count tasbeeh</Text>
      <View style={styles.counterCard}>
        <Text style={styles.counterLabel}>COUNT</Text>
        <Text style={styles.counterValue}>{count}</Text>
      </View>
      <View style={styles.row}>
        <Pressable style={styles.primaryButton} onPress={() => setCount((value) => value + 1)}>
          <Text style={styles.primaryText}>+1</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => setCount(0)}>
          <Text style={styles.secondaryText}>Reset</Text>
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
  subtle: {
    color: colors.muted
  },
  counterCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    paddingVertical: 28,
    alignItems: "center"
  },
  counterLabel: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 1.2
  },
  counterValue: {
    color: colors.text,
    fontSize: 54,
    fontWeight: "700",
    marginTop: 6
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  primaryText: {
    color: "#fff",
    fontWeight: "700"
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  secondaryText: {
    color: colors.text,
    fontWeight: "600"
  }
});
