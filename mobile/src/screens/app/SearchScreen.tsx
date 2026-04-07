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
import { fetchEventsNear } from "../../lib/events";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors, radii } from "../../theme";
import { useTabSceneBottomPadding, useTabSceneTopPadding } from "../../hooks/useTabSceneInsets";
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
type NearKind = "all" | "businesses" | "events";
type NearTimeWindow = "upcoming" | "today" | "this_week";
type EventCluster = {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
};

function clusterNearbyEvents(
  items: { latitude: number | null; longitude: number | null }[],
  precision = 2
) {
  const map = new Map<string, EventCluster>();
  for (const item of items) {
    if (item.latitude == null || item.longitude == null) continue;
    const lat = Number(item.latitude.toFixed(precision));
    const lng = Number(item.longitude.toFixed(precision));
    const key = `${lat},${lng}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, { id: key, latitude: lat, longitude: lng, count: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

const FALLBACK = { lat: 40.7128, lng: -74.006 };

export function SearchScreen({ navigation }: Props) {
  const topPad = useTabSceneTopPadding(12);
  const bottomPad = useTabSceneBottomPadding(20);
  const [mode, setMode] = useState<Mode>("search");
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [nearKind, setNearKind] = useState<NearKind>("all");
  const [nearTimeWindow, setNearTimeWindow] = useState<NearTimeWindow>("upcoming");
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);

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
      apiRequest<{ items: UserItem[] }>(`/search/users?q=${encodeURIComponent(submittedQ)}&limit=10`),
    enabled: mode === "search" && submittedQ.length > 0
  });

  const postsQuery = useQuery({
    queryKey: ["mobile-search-posts", submittedQ],
    queryFn: () =>
      apiRequest<{ items: PostItem[] }>(`/search/posts?q=${encodeURIComponent(submittedQ)}&limit=10`),
    enabled: mode === "search" && submittedQ.length > 0
  });

  const nearQuery = useQuery({
    queryKey: ["mobile-businesses-near", geo?.lat, geo?.lng],
    queryFn: () => fetchBusinessesNear({ lat: geo!.lat, lng: geo!.lng }),
    enabled: mode === "near" && Boolean(geo)
  });
  const nearEventsQuery = useQuery({
    queryKey: ["mobile-events-near", geo?.lat, geo?.lng, nearTimeWindow],
    queryFn: () => fetchEventsNear({ lat: geo!.lat, lng: geo!.lng, timeWindow: nearTimeWindow }),
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
  const clusterPrecision = nearTimeWindow === "today" ? 2 : 1;
  const eventClusters = clusterNearbyEvents(nearEventsQuery.data?.items || [], clusterPrecision);
  const visibleEvents =
    selectedCluster && nearKind !== "businesses"
      ? (nearEventsQuery.data?.items || []).filter((event) => {
          if (event.latitude == null || event.longitude == null) return false;
          const key = `${Number(event.latitude.toFixed(clusterPrecision))},${Number(
            event.longitude.toFixed(clusterPrecision)
          )}`;
          return key === selectedCluster;
        })
      : nearEventsQuery.data?.items || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: topPad, paddingBottom: bottomPad }]}
    >
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
              {nearEventsQuery.isLoading ? <LoadingState label="Loading nearby events…" /> : null}
              {nearEventsQuery.error ? <ErrorState message={(nearEventsQuery.error as Error).message} /> : null}
              <View style={styles.modeRow}>
                {(["all", "businesses", "events"] as const).map((kind) => (
                  <Pressable
                    key={kind}
                    style={[styles.modeChip, nearKind === kind ? styles.modeChipOn : null]}
                    onPress={() => setNearKind(kind)}
                  >
                    <Text style={[styles.modeChipText, nearKind === kind ? styles.modeChipTextOn : null]}>
                      {kind === "all" ? "All" : kind === "businesses" ? "Businesses" : "Events"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {(nearKind === "all" || nearKind === "events") ? (
                <View style={styles.modeRow}>
                  {(["upcoming", "today", "this_week"] as const).map((windowKey) => (
                    <Pressable
                      key={windowKey}
                      style={[styles.modeChip, nearTimeWindow === windowKey ? styles.modeChipOn : null]}
                      onPress={() => setNearTimeWindow(windowKey)}
                    >
                      <Text style={[styles.modeChipText, nearTimeWindow === windowKey ? styles.modeChipTextOn : null]}>
                        {windowKey === "upcoming" ? "Upcoming" : windowKey === "today" ? "Today" : "This week"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {(nearKind === "all" || nearKind === "events") && eventClusters.length > 0 ? (
                <View style={styles.clusterCard}>
                  <View style={styles.clusterHeader}>
                    <Text style={styles.title}>Event clusters</Text>
                    {selectedCluster ? (
                      <Pressable onPress={() => setSelectedCluster(null)}>
                        <Text style={styles.linkText}>Clear</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.modeRow}>
                    {eventClusters.map((cluster) => (
                      <Pressable
                        key={cluster.id}
                        style={[styles.modeChip, selectedCluster === cluster.id ? styles.modeChipOn : null]}
                        onPress={() => setSelectedCluster(cluster.id)}
                      >
                        <Text style={[styles.modeChipText, selectedCluster === cluster.id ? styles.modeChipTextOn : null]}>
                          {cluster.count} near {cluster.latitude.toFixed(2)},{cluster.longitude.toFixed(2)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              <Text style={styles.title}>Nearby</Text>
              {(nearQuery.data?.items || []).length === 0 &&
              (nearEventsQuery.data?.items || []).length === 0 &&
              !nearQuery.isLoading &&
              !nearEventsQuery.isLoading ? (
                <EmptyState
                  title="No nearby events or businesses"
                  subtitle={canUseBusinessDirectoryTools ? "Add your business from the button above." : "Try another area."}
                />
              ) : null}
              {(nearKind === "all" || nearKind === "businesses" ? nearQuery.data?.items || [] : []).map((biz) => (
                <Pressable
                  key={biz.id}
                  style={styles.bizRow}
                  onPress={() => navigation.navigate("BusinessDetail", { id: biz.id })}
                >
                  <Text style={styles.item}>{biz.name}</Text>
                  <Text style={styles.muted}>Business</Text>
                  {typeof biz.distanceM === "number" ? (
                    <Text style={styles.muted}>{(biz.distanceM / 1000).toFixed(1)} km</Text>
                  ) : null}
                </Pressable>
              ))}
              {(nearKind === "all" || nearKind === "events" ? visibleEvents : []).map((event) => (
                <Pressable
                  key={`event-${event.id}`}
                  style={styles.bizRow}
                  onPress={() => navigation.navigate("EventDetail", { id: event.id })}
                >
                  <Text style={styles.item}>{event.title}</Text>
                  <Text style={styles.muted}>Event · {new Date(event.startsAt).toLocaleDateString()}</Text>
                  {typeof event.distanceM === "number" ? (
                    <Text style={styles.muted}>{(event.distanceM / 1000).toFixed(1)} km</Text>
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
  container: { flex: 1, backgroundColor: colors.atmosphere },
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
  clusterCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    padding: 10,
    gap: 8
  },
  clusterHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  linkText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
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
