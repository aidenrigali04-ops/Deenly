import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { colors, primaryButtonOutline, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type BusinessNear = {
  id: number;
  name: string;
  description?: string | null;
  category?: string | null;
  addressDisplay?: string | null;
  latitude: number;
  longitude: number;
  distanceM?: number;
};

type Props = NativeStackScreenProps<RootStackParamList, "BusinessesNearMe">;

function openInMaps(lat: number, lng: number, label: string) {
  const encoded = encodeURIComponent(label);
  const url =
    Platform.OS === "ios"
      ? `maps:0,0?q=${encoded}@${lat},${lng}`
      : `geo:0,0?q=${lat},${lng}(${encoded})`;
  Linking.openURL(url).catch(() => {
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    void Linking.openURL(fallback);
  });
}

export function BusinessesNearMeScreen({ navigation }: Props) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  const resolveLocation = useCallback(async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setLocationError("Location permission is needed to show businesses near you.");
        setCoords(null);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      setLocationError("Could not read your location. Try again.");
      setCoords(null);
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    void resolveLocation();
  }, [resolveLocation]);

  const nearQuery = useQuery({
    queryKey: ["mobile-businesses-near", coords?.lat, coords?.lng],
    queryFn: () =>
      apiRequest<{ items: BusinessNear[] }>(
        `/businesses/near?lat=${coords!.lat}&lng=${coords!.lng}&radiusM=12000&limit=60`,
        { auth: true }
      ),
    enabled: Boolean(coords)
  });

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Businesses near you</Text>
      <Text style={styles.sub}>
        Small businesses listed on Deenly. Tap a listing for details and AI Q&A, or open directions in your maps app.
      </Text>

      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={() => navigation.navigate("AddBusiness")}>
          <Text style={styles.primaryText}>Add your business</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => void resolveLocation()} disabled={locating}>
          <Text style={styles.secondaryText}>{locating ? "Updating location…" : "Refresh location"}</Text>
        </Pressable>
      </View>

      {locating ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>Finding your location…</Text>
        </View>
      ) : null}

      {!locating && locationError ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{locationError}</Text>
          <Pressable
            onPress={() => {
              Alert.alert(
                "Location",
                "Open Settings and allow location for Deenly, then return and tap Refresh location."
              );
            }}
          >
            <Text style={styles.link}>Tips</Text>
          </Pressable>
        </View>
      ) : null}

      {!locating && coords && nearQuery.isLoading ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}

      {!locating && coords && nearQuery.error ? (
        <Text style={styles.err}>{(nearQuery.error as Error).message || "Could not load listings."}</Text>
      ) : null}

      {!locating && coords && nearQuery.isSuccess && nearQuery.data.items.length === 0 ? (
        <Text style={styles.muted}>No published businesses in this area yet. Be the first to add yours.</Text>
      ) : null}

      {nearQuery.data?.items.map((b) => (
        <View key={b.id} style={styles.card}>
          <Pressable onPress={() => navigation.navigate("BusinessDetail", { id: b.id })}>
            <Text style={styles.cardTitle}>{b.name}</Text>
            {b.category ? <Text style={styles.cardMeta}>{b.category}</Text> : null}
            {b.distanceM != null ? (
              <Text style={styles.cardMeta}>{(b.distanceM / 1000).toFixed(1)} km away</Text>
            ) : null}
            {b.addressDisplay ? <Text style={styles.cardBody}>{b.addressDisplay}</Text> : null}
          </Pressable>
          <Pressable
            style={styles.mapsBtn}
            onPress={() => openInMaps(b.latitude, b.longitude, b.name)}
          >
            <Text style={styles.mapsBtnText}>Open in maps</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  sub: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  actions: { gap: 8, marginTop: 4 },
  primary: {
    borderRadius: radii.control,
    paddingVertical: 12,
    ...primaryButtonOutline
  },
  primaryText: { color: colors.onAccent, fontWeight: "600" },
  secondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.surface
  },
  secondaryText: { color: colors.text, fontWeight: "600" },
  centerBlock: { paddingVertical: 24, alignItems: "center", gap: 8 },
  muted: { color: colors.muted, fontSize: 14 },
  err: { color: "#b91c1c", fontSize: 14 },
  banner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.control,
    padding: 12,
    backgroundColor: colors.surface,
    gap: 6
  },
  bannerText: { color: colors.text, fontSize: 13 },
  link: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.panel,
    padding: 14,
    backgroundColor: colors.card,
    gap: 10
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  cardMeta: { fontSize: 12, fontWeight: "600", color: colors.muted, marginTop: 2 },
  cardBody: { fontSize: 14, color: colors.text, marginTop: 6, lineHeight: 20 },
  mapsBtn: {
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  mapsBtnText: { fontSize: 12, fontWeight: "700", color: colors.text }
});
