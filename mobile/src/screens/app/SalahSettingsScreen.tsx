import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { fetchPrayerSettings, updatePrayerSettings } from "../../lib/prayer";
import { colors } from "../../theme";

export function SalahSettingsScreen() {
  const [saving, setSaving] = useState(false);
  const prayerQuery = useQuery({
    queryKey: ["mobile-prayer-settings"],
    queryFn: () => fetchPrayerSettings()
  });

  const [form, setForm] = useState({
    quiet_mode: "prayer_windows",
    calculation_method: "muslim_world_league",
    timezone: "UTC",
    quiet_minutes_before: "10",
    quiet_minutes_after: "20",
    latitude: "21.4225",
    longitude: "39.8262"
  });

  useEffect(() => {
    if (!prayerQuery.data) {
      return;
    }
    setForm({
      quiet_mode: prayerQuery.data.quiet_mode,
      calculation_method: prayerQuery.data.calculation_method,
      timezone: prayerQuery.data.timezone,
      quiet_minutes_before: String(prayerQuery.data.quiet_minutes_before),
      quiet_minutes_after: String(prayerQuery.data.quiet_minutes_after),
      latitude: String(prayerQuery.data.latitude),
      longitude: String(prayerQuery.data.longitude)
    });
  }, [prayerQuery.data]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Salah Settings</Text>
      <Text style={styles.subtle}>
        Pause in-app and push alerts around prayer windows. Push reminders follow the same quiet rules so worship time stays undisturbed.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Quiet mode</Text>
        <View style={styles.row}>
          {(["prayer_windows", "always", "off"] as const).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.choice, form.quiet_mode === mode ? styles.choiceActive : null]}
              onPress={() => {
                setForm((prev) => ({ ...prev, quiet_mode: mode }));
              }}
            >
              <Text style={[styles.choiceText, form.quiet_mode === mode ? styles.choiceTextActive : null]}>{mode}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Timezone</Text>
        <TextInput
          value={form.timezone}
          onChangeText={(value) => {
            setForm((prev) => ({ ...prev, timezone: value }));
          }}
          placeholder="UTC"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Calculation method</Text>
        <View style={styles.row}>
          {(
            [
              ["muslim_world_league", "MWL"],
              ["umm_al_qura", "Umm al-Qura"],
              ["north_america", "North America"],
              ["egyptian", "Egyptian"],
              ["karachi", "Karachi"]
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              style={[styles.choice, form.calculation_method === value ? styles.choiceActive : null]}
              onPress={() => {
                setForm((prev) => ({ ...prev, calculation_method: value }));
              }}
            >
              <Text style={[styles.choiceText, form.calculation_method === value ? styles.choiceTextActive : null]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Quiet mins before</Text>
        <TextInput
          value={form.quiet_minutes_before}
          onChangeText={(value) => {
            setForm((prev) => ({ ...prev, quiet_minutes_before: value }));
          }}
          keyboardType="numeric"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Quiet mins after</Text>
        <TextInput
          value={form.quiet_minutes_after}
          onChangeText={(value) => {
            setForm((prev) => ({ ...prev, quiet_minutes_after: value }));
          }}
          keyboardType="numeric"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Latitude</Text>
        <TextInput
          value={form.latitude}
          onChangeText={(value) => {
            setForm((prev) => ({ ...prev, latitude: value }));
          }}
          keyboardType="numeric"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Longitude</Text>
        <TextInput
          value={form.longitude}
          onChangeText={(value) => {
            setForm((prev) => ({ ...prev, longitude: value }));
          }}
          keyboardType="numeric"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Pressable
          style={styles.button}
          disabled={saving}
          onPress={async () => {
            setSaving(true);
            await updatePrayerSettings({
              quiet_mode: form.quiet_mode as "off" | "prayer_windows" | "always",
              calculation_method: form.calculation_method,
              timezone: form.timezone,
              quiet_minutes_before: Number(form.quiet_minutes_before),
              quiet_minutes_after: Number(form.quiet_minutes_after),
              latitude: Number(form.latitude),
              longitude: Number(form.longitude)
            });
            await prayerQuery.refetch();
            setSaving(false);
          }}
        >
          <Text style={styles.buttonText}>{saving ? "Saving..." : "Save settings"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  subtle: { color: colors.muted },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    padding: 12,
    gap: 8
  },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  choiceActive: {
    backgroundColor: colors.accentTint,
    borderWidth: 0
  },
  choiceText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  choiceTextActive: { color: colors.accentTextOnTint },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text
  },
  button: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center"
  },
  buttonText: { color: colors.text, fontWeight: "700" }
});
