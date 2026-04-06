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
import { ApiError, apiRequest } from "../../lib/api";
import { assistPostText } from "../../lib/ai-assist";
import { colors, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "AddBusiness">;

function buildBusinessAssistDraft(
  name: string,
  description: string,
  category: string,
  addressDisplay: string,
  websiteUrl: string
) {
  const parts = [`Name: ${name.trim()}`];
  if (category.trim()) {
    parts.push(`Category: ${category.trim()}`);
  }
  if (addressDisplay.trim()) {
    parts.push(`Address: ${addressDisplay.trim()}`);
  }
  if (websiteUrl.trim()) {
    parts.push(`Website: ${websiteUrl.trim()}`);
  }
  if (description.trim()) {
    parts.push(`What we offer (notes): ${description.trim()}`);
  }
  return parts.join("\n");
}

function buildBusinessOffering(
  name: string,
  description: string,
  category: string,
  addressDisplay: string
): string {
  const n = name.trim();
  const d = description.trim();
  const c = category.trim();
  const a = addressDisplay.trim();
  let line = d ? `${n} — ${d}` : n;
  if (c) line = `${c}: ${line}`;
  if (a) line = `${line}\n${a}`;
  return line.slice(0, 2000);
}

export function AddBusinessScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<"profile" | "map">("profile");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [addressDisplay, setAddressDisplay] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  const assistMutation = useMutation({
    mutationFn: async () => {
      const draft = buildBusinessAssistDraft(name, description, category, addressDisplay, websiteUrl);
      const res = await assistPostText(draft, "business_listing");
      return res.suggestion;
    },
    onSuccess: (suggestion) => {
      setDescription(suggestion);
    },
    onError: (e: Error) => {
      const msg = e instanceof ApiError ? e.message : e.message || "Try again.";
      Alert.alert("Could not polish", msg);
    }
  });

  const canPolishDescription =
    name.trim().length >= 2 && (description.trim().length >= 3 || category.trim().length >= 1);

  const profileMutation = useMutation({
    mutationFn: async () => {
      const offering = buildBusinessOffering(name, description, category, addressDisplay);
      await apiRequest("/users/me", {
        method: "PUT",
        auth: true,
        body: {
          businessOffering: offering,
          websiteUrl: websiteUrl.trim() || null
        }
      });
      await apiRequest("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: { showBusinessOnProfile: true }
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-account-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-feed-profile-me"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-user-me-onboarding"] });
      setPhase("map");
    },
    onError: (e: Error) => {
      Alert.alert("Could not save", e.message || "Try again.");
    }
  });

  const mapMutation = useMutation({
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
      await queryClient.invalidateQueries({ queryKey: ["mobile-account-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-feed-profile-me"] });
      Alert.alert("On the map", "Your listing is published for Near me.", [
        { text: "OK", onPress: () => navigation.navigate("BusinessDetail", { id: data.id }) }
      ]);
    },
    onError: (e: Error) => {
      Alert.alert("Could not publish on map", e.message || "Try again.");
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

  const canAddProfile = name.trim().length >= 2 && !profileMutation.isPending;
  const canPublishMap =
    name.trim().length >= 2 && latitude != null && longitude != null && !mapMutation.isPending;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Add your business</Text>
      <Text style={styles.hint}>
        {phase === "profile"
          ? "Step 1: Add details to your profile for search. Name is required. Map listing is an optional next step."
          : "Step 2 (optional): Set a pin so your business appears on Near me. You can skip and stay profile-only."}
      </Text>

      {phase === "map" ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Profile updated. You can publish on the map below or tap Skip.</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Business name" editable={phase === "profile"} />
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="What you offer"
        multiline
        editable={phase === "profile"}
      />
      <Text style={styles.label}>Category</Text>
      <TextInput
        style={styles.input}
        value={category}
        onChangeText={setCategory}
        placeholder="e.g. Cafe, Retail"
        editable={phase === "profile"}
      />
      <Text style={styles.label}>Address (display)</Text>
      <TextInput
        style={styles.input}
        value={addressDisplay}
        onChangeText={setAddressDisplay}
        placeholder="Street, city"
        editable={phase === "profile"}
      />
      <Text style={styles.label}>Website (optional)</Text>
      <TextInput
        style={styles.input}
        value={websiteUrl}
        onChangeText={setWebsiteUrl}
        placeholder="https://..."
        autoCapitalize="none"
        editable={phase === "profile"}
      />

      {phase === "profile" ? (
        <>
          <Pressable
            style={[
              styles.secondary,
              (!canPolishDescription || assistMutation.isPending) && styles.primaryDisabled
            ]}
            disabled={!canPolishDescription || assistMutation.isPending}
            onPress={() => assistMutation.mutate()}
          >
            <Text style={styles.secondaryText}>
              {assistMutation.isPending ? "Polishing…" : "Polish description"}
            </Text>
          </Pressable>
          <Text style={styles.polishHint}>Uses your name, category, address, and notes—edit the result before saving.</Text>
          <Pressable
            style={[styles.primary, !canAddProfile ? styles.primaryDisabled : null]}
            disabled={!canAddProfile}
            onPress={() => profileMutation.mutate()}
          >
            <Text style={styles.primaryText}>{profileMutation.isPending ? "Saving…" : "Add to profile"}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.label, styles.mapSectionLabel]}>Map pin</Text>
          <Pressable style={styles.secondary} onPress={useMyLocation} disabled={locating}>
            <Text style={styles.secondaryText}>{locating ? "Getting location…" : "Use my current location"}</Text>
          </Pressable>
          {latitude != null && longitude != null ? (
            <Text style={styles.coords}>
              Pin: {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </Text>
          ) : (
            <Text style={styles.warn}>Set a location to publish on the map.</Text>
          )}
          <Pressable
            style={[styles.primary, !canPublishMap ? styles.primaryDisabled : null]}
            disabled={!canPublishMap}
            onPress={() => mapMutation.mutate()}
          >
            <Text style={styles.primaryText}>{mapMutation.isPending ? "Publishing…" : "Publish on map"}</Text>
          </Pressable>
          <Pressable style={styles.skip} onPress={() => navigation.goBack()} disabled={mapMutation.isPending}>
            <Text style={styles.skipText}>Skip — stay profile only</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 8 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  hint: { color: colors.muted, marginBottom: 8 },
  banner: {
    backgroundColor: colors.subtleFill,
    borderRadius: radii.control,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  bannerText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  label: { fontSize: 12, fontWeight: "600", color: colors.muted, marginTop: 6 },
  mapSectionLabel: { marginTop: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.control,
    padding: 12,
    backgroundColor: colors.card,
    color: colors.text
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  polishHint: { color: colors.muted, fontSize: 12, marginTop: 4 },
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
  primaryText: { color: colors.onAccent, fontWeight: "700" },
  skip: { marginTop: 12, paddingVertical: 12, alignItems: "center" },
  skipText: { color: colors.muted, fontWeight: "600", fontSize: 15 }
});
