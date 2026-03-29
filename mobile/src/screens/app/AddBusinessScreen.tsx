import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { colors, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "AddBusiness">;

export function AddBusinessScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [addressDisplay, setAddressDisplay] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ id: number }>("/businesses", {
        method: "POST",
        auth: true,
        body: {
          name: name.trim(),
          description: description.trim() || null,
          category: category.trim() || null,
          addressDisplay: addressDisplay.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
          latitude,
          longitude,
          visibility: "published"
        }
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-businesses-near"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-businesses-mine"] });
      Alert.alert("Saved", "Your business is on the map.", [
        { text: "OK", onPress: () => navigation.navigate("BusinessDetail", { id: data.id }) }
      ]);
    },
    onError: (e: Error) => {
      Alert.alert("Could not save", e.message || "Try again.");
    }
  });

  async function useMyLocation() {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Location", "Enable location to place your pin.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
    } finally {
      setLocating(false);
    }
  }

  const canSubmit =
    name.trim().length >= 2 && latitude != null && longitude != null && !createMutation.isPending;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Add your business</Text>
      <Text style={styles.hint}>Name and map location are required. Other fields help neighbors find you.</Text>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Business name" />
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="What you offer"
        multiline
      />
      <Text style={styles.label}>Category</Text>
      <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="e.g. Cafe, Retail" />
      <Text style={styles.label}>Address (display)</Text>
      <TextInput style={styles.input} value={addressDisplay} onChangeText={setAddressDisplay} placeholder="Street, city" />
      <Text style={styles.label}>Website (optional)</Text>
      <TextInput style={styles.input} value={websiteUrl} onChangeText={setWebsiteUrl} placeholder="https://..." autoCapitalize="none" />
      <Pressable style={styles.secondary} onPress={useMyLocation} disabled={locating}>
        <Text style={styles.secondaryText}>{locating ? "Getting location…" : "Use my current location"}</Text>
      </Pressable>
      {latitude != null && longitude != null ? (
        <Text style={styles.coords}>
          Pin: {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </Text>
      ) : (
        <Text style={styles.warn}>Set location to place your business on the map.</Text>
      )}
      <Pressable
        style={[styles.primary, !canSubmit ? styles.primaryDisabled : null]}
        disabled={!canSubmit}
        onPress={() => createMutation.mutate()}
      >
        <Text style={styles.primaryText}>{createMutation.isPending ? "Saving…" : "Publish on map"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 8 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  hint: { color: colors.muted, marginBottom: 8 },
  label: { fontSize: 12, fontWeight: "600", color: colors.muted, marginTop: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.control,
    padding: 12,
    backgroundColor: colors.card,
    color: colors.text
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  secondary: {
    marginTop: 8,
    padding: 12,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center"
  },
  secondaryText: { fontWeight: "600", color: colors.text },
  coords: { color: colors.muted, fontSize: 13 },
  warn: { color: colors.danger, fontSize: 13 },
  primary: {
    marginTop: 16,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: radii.control,
    alignItems: "center"
  },
  primaryDisabled: { opacity: 0.45 },
  primaryText: { color: colors.onAccent, fontWeight: "700" }
});
