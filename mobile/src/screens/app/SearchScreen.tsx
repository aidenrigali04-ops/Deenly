import { useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { fetchBusinessesNear } from "../../lib/businesses";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors, radii } from "../../theme";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";

type UserItem = {
  user_id: number;
  username: string;
  display_name: string;
};

type PostItem = {
  id: number;
  post_type: string;
  content: string;
  author_display_name: string;
};

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "SearchTab">,
  NativeStackScreenProps<RootStackParamList>
>;

type Mode = "search" | "near";

const FALLBACK = { lat: 40.7128, lng: -74.006 };

export function SearchScreen({ navigation }: Props) {
  const [mode, setMode] = useState<Mode>("search");
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  useEffect(() => {
    if (mode !== "near") return;
    let cancelled = false;
    (async () => {
      setGeoLoading(true);
      setGeoNote(null);
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== "granted") {
          if (!cancelled) {
            setGeoNote("Location denied — showing sample area. Enable location for true Near me.");
            setGeo(FALLBACK);
          }
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        if (!cancelled) {
          setGeoNote("Could not read location — sample area shown.");
          setGeo(FALLBACK);
        }
      } finally {
        if (!cancelled) setGeoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const usersQuery = useQuery({
    queryKey: ["mobile-search-users", submittedQ],
    queryFn: () =>
      apiRequest<{ items: UserItem[] }>(`/search/users?q=${encodeURIComponent(submittedQ)}&limit=10`, {
        auth: true
      }),
    enabled: mode === "search" && submittedQ.length > 0
  });

  const postsQuery = useQuery({
    queryKey: ["mobile-search-posts", submittedQ],
    queryFn: () =>
      apiRequest<{ items: PostItem[] }>(`/search/posts?q=${encodeURIComponent(submittedQ)}&limit=10`, {
        auth: true
      }),
    enabled: mode === "search" && submittedQ.length > 0
  });

  const nearQuery = useQuery({
    queryKey: ["mobile-businesses-near", geo?.lat, geo?.lng],
    queryFn: () => fetchBusinessesNear({ lat: geo!.lat, lng: geo!.lng }),
    enabled: mode === "near" && Boolean(geo)
  });
  const profileQuery = useQuery({
    queryKey: ["mobile-search-profile-capabilities"],
    queryFn: () =>
      apiRequest<{
        persona_capabilities?: {
          can_use_business_directory_tools?: boolean;
        };
      }>("/users/me", { auth: true })
  });
  const canUseBusinessDirectoryTools = Boolean(profileQuery.data?.persona_capabilities?.can_use_business_directory_tools);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Search</Text>
      <View style={styles.modeRow}>
        <Pressable style={[styles.modeChip, mode === "search" ? styles.modeChipOn : null]} onPress={() => setMode("search")}>
          <Text style={[styles.modeChipText, mode === "search" ? styles.modeChipTextOn : null]}>Search</Text>
        </Pressable>
        <Pressable style={[styles.modeChip, mode === "near" ? styles.modeChipOn : null]} onPress={() => setMode("near")}>
          <Text style={[styles.modeChipText, mode === "near" ? styles.modeChipTextOn : null]}>Near me</Text>
        </Pressable>
        {canUseBusinessDirectoryTools ? (
          <Pressable style={styles.addBiz} onPress={() => navigation.navigate("AddBusiness")}>
            <Text style={styles.addBizText}>Add business</Text>
          </Pressable>
        ) : null}
      </View>

      {mode === "search" ? (
        <>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, styles.flex1]}
              placeholder="Search users or posts..."
              placeholderTextColor={colors.muted}
              value={q}
              onChangeText={setQ}
            />
            <Pressable style={styles.buttonSecondary} onPress={() => setSubmittedQ(q.trim())}>
              <Text style={styles.buttonText}>Go</Text>
            </Pressable>
          </View>
          {!submittedQ ? <EmptyState title="Search the platform" /> : null}
          {usersQuery.isLoading || postsQuery.isLoading ? <LoadingState label="Searching..." /> : null}
          {usersQuery.error ? <ErrorState message={(usersQuery.error as Error).message} /> : null}
          {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
          {submittedQ ? (
            <>
              <View style={styles.card}>
                <Text style={styles.title}>Users</Text>
                {(usersQuery.data?.items || []).map((user) => (
                  <Pressable key={user.user_id} onPress={() => navigation.navigate("UserProfile", { id: user.user_id })}>
                    <Text style={styles.item}>{user.display_name} (@{user.username})</Text>
                  </Pressable>
                ))}
                {(usersQuery.data?.items || []).length === 0 ? <EmptyState title="No users found" /> : null}
              </View>
              <View style={styles.card}>
                <Text style={styles.title}>Posts</Text>
                {(postsQuery.data?.items || []).map((post) => (
                  <Pressable key={post.id} onPress={() => navigation.navigate("PostDetail", { id: post.id })}>
                    <Text style={styles.item}>
                      [{post.post_type}] {post.content}
                    </Text>
                    <Text style={styles.muted}>by {post.author_display_name}</Text>
                  </Pressable>
                ))}
                {(postsQuery.data?.items || []).length === 0 ? <EmptyState title="No posts found" /> : null}
              </View>
            </>
          ) : null}
        </>
      ) : (
        <View style={styles.nearSection}>
          {geoNote ? <Text style={styles.note}>{geoNote}</Text> : null}
          {geoLoading ? <LoadingState label="Finding your area…" /> : null}
          {!geoLoading && geo ? (
            <>
              <Pressable
                style={styles.mapPlaceholder}
                onPress={() => Linking.openURL(`https://www.google.com/maps/@${geo.lat},${geo.lng},13z`)}
              >
                <Text style={styles.mapPlaceholderText}>Open area in Maps</Text>
                <Text style={styles.mutedSmall}>
                  {geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}
                </Text>
              </Pressable>
              {nearQuery.isLoading ? <LoadingState label="Loading nearby…" /> : null}
              {nearQuery.error ? <ErrorState message={(nearQuery.error as Error).message} /> : null}
              <Text style={styles.title}>Nearby businesses</Text>
              {(nearQuery.data?.items || []).length === 0 && !nearQuery.isLoading ? (
                <EmptyState
                  title="No businesses yet"
                  subtitle={canUseBusinessDirectoryTools ? "Add yours from the button above." : "Business directory listing is available in Business mode."}
                />
              ) : null}
              {(nearQuery.data?.items || []).map((biz) => (
                <Pressable
                  key={biz.id}
                  style={styles.bizRow}
                  onPress={() => navigation.navigate("BusinessDetail", { id: biz.id })}
                >
                  <Text style={styles.item}>{biz.name}</Text>
                  {typeof biz.distanceM === "number" ? (
                    <Text style={styles.muted}>{(biz.distanceM / 1000).toFixed(1)} km</Text>
                  ) : null}
                </Pressable>
              ))}
            </>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12, paddingBottom: 32 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  modeChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeChipText: { color: colors.text, fontWeight: "600", fontSize: 13 },
  modeChipTextOn: { color: colors.onAccent },
  addBiz: { marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 8 },
  addBizText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  searchRow: { flexDirection: "row", gap: 8 },
  flex1: { flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    padding: 12,
    gap: 8
  },
  title: { color: colors.text, fontWeight: "700" },
  item: { color: colors.text },
  muted: { color: colors.muted, fontSize: 12 },
  mutedSmall: { color: colors.muted, fontSize: 11, marginTop: 4 },
  input: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: 10
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    justifyContent: "center"
  },
  buttonText: { color: colors.text, fontWeight: "600" },
  nearSection: { gap: 10 },
  note: { color: colors.danger, fontSize: 12 },
  mapPlaceholder: {
    minHeight: 140,
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 16
  },
  mapPlaceholderText: { color: colors.accent, fontWeight: "700" },
  bizRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  }
});
