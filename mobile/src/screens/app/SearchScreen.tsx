import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { fetchBusinessesNear } from "../../lib/businesses";
import { fetchEventsNear } from "../../lib/events";
import { NearMeMap, type NearMapSelection } from "../../components/NearMeMap";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { SectionCard, TabScreenRoot } from "../../components/TabScreenChrome";
import { colors, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

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

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

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
  const insets = useSafeAreaInsets();
  const topPad = 12;
  const bottomPad = insets.bottom + 24;
  const [mode, setMode] = useState<Mode>("search");
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [nearKind, setNearKind] = useState<NearKind>("all");
  const [nearTimeWindow, setNearTimeWindow] = useState<NearTimeWindow>("upcoming");
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [mapSelection, setMapSelection] = useState<NearMapSelection>(null);

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

  useEffect(() => {
    setMapSelection(null);
  }, [nearKind, nearTimeWindow, selectedCluster]);

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
    <TabScreenRoot>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: topPad, paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introRow}>
          <Text style={styles.introText}>Find people, posts, and places near you.</Text>
          {canUseBusinessDirectoryTools ? (
            <Pressable style={styles.headerLink} onPress={() => navigation.navigate("AddBusiness")}>
              <Text style={styles.headerLinkText}>Add business</Text>
            </Pressable>
          ) : null}
        </View>

        <SectionCard>
          <Text style={styles.panelLabel}>Mode</Text>
          <View style={styles.modeRow}>
            <Pressable style={[styles.modeChip, mode === "search" ? styles.modeChipOn : null]} onPress={() => setMode("search")}>
              <Text style={[styles.modeChipText, mode === "search" ? styles.modeChipTextOn : null]}>Search</Text>
            </Pressable>
            <Pressable style={[styles.modeChip, mode === "near" ? styles.modeChipOn : null]} onPress={() => setMode("near")}>
              <Text style={[styles.modeChipText, mode === "near" ? styles.modeChipTextOn : null]}>Near me</Text>
            </Pressable>
          </View>
        </SectionCard>

        {mode === "search" ? (
          <>
            <SectionCard title="Look up">
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, styles.flex1]}
                  placeholder="Search users or posts..."
                  placeholderTextColor={colors.muted}
                  value={q}
                  onChangeText={setQ}
                  onSubmitEditing={() => setSubmittedQ(q.trim())}
                  returnKeyType="search"
                />
                <Pressable style={styles.buttonSecondary} onPress={() => setSubmittedQ(q.trim())}>
                  <Text style={styles.buttonText}>Go</Text>
                </Pressable>
              </View>
            </SectionCard>

            {!submittedQ ? (
              <SectionCard title="Start here">
                <Text style={styles.hintPara}>Choose how you want to explore—same tools as the chips above, with a bit more context.</Text>
                <Pressable
                  style={styles.shortcutTile}
                  onPress={() => {
                    setMode("search");
                    setSubmittedQ("");
                  }}
                >
                  <Text style={styles.shortcutTitle}>Search people & posts</Text>
                  <Text style={styles.shortcutSub}>Type a name, @username, or keyword and tap Go.</Text>
                </Pressable>
                <Pressable style={styles.shortcutTile} onPress={() => setMode("near")}>
                  <Text style={styles.shortcutTitle}>Browse near me</Text>
                  <Text style={styles.shortcutSub}>Uses your general area for businesses and events with an in-app map.</Text>
                </Pressable>
              </SectionCard>
            ) : null}

            {usersQuery.isLoading || postsQuery.isLoading ? <LoadingState label="Searching..." /> : null}
            {usersQuery.error ? <ErrorState message={(usersQuery.error as Error).message} /> : null}
            {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
            {submittedQ ? (
              <>
                <SectionCard title="People">
                  {(usersQuery.data?.items || []).map((user) => (
                    <Pressable
                      key={user.user_id}
                      style={styles.resultRow}
                      onPress={() => navigation.navigate("UserProfile", { id: user.user_id })}
                    >
                      <View style={styles.resultRowText}>
                        <View style={styles.avatarPlaceholder}>
                          <Text style={styles.avatarLetter}>{(user.display_name || user.username).slice(0, 1).toUpperCase()}</Text>
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.item}>{user.display_name}</Text>
                          <Text style={styles.muted}>@{user.username}</Text>
                        </View>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  ))}
                  {(usersQuery.data?.items || []).length === 0 && !usersQuery.isLoading ? (
                    <EmptyState title="No users found" subtitle="Try another spelling or keyword." />
                  ) : null}
                </SectionCard>
                <SectionCard title="Posts">
                  {(postsQuery.data?.items || []).map((post) => (
                    <Pressable key={post.id} style={styles.resultRow} onPress={() => navigation.navigate("PostDetail", { id: post.id })}>
                      <View style={styles.flex1}>
                        <Text style={styles.postTypeTag}>{post.post_type}</Text>
                        <Text style={styles.item} numberOfLines={2}>
                          {post.content}
                        </Text>
                        <Text style={styles.muted}>by {post.author_display_name}</Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  ))}
                  {(postsQuery.data?.items || []).length === 0 && !postsQuery.isLoading ? (
                    <EmptyState title="No posts found" subtitle="Try different keywords." />
                  ) : null}
                </SectionCard>
              </>
            ) : null}
          </>
        ) : (
          <View style={styles.nearSection}>
            {geoNote ? <Text style={styles.note}>{geoNote}</Text> : null}
            {geoLoading ? <LoadingState label="Finding your area…" /> : null}
            {!geoLoading && geo ? (
              <>
                <SectionCard title="Your area">
                  <Text style={styles.privacyNote}>
                    We use approximate location to list nearby businesses and events. Exact coordinates are not shared on your profile.
                  </Text>
                  <NearMeMap
                    center={geo}
                    businesses={nearKind === "all" || nearKind === "businesses" ? nearQuery.data?.items ?? [] : []}
                    events={nearKind === "all" || nearKind === "events" ? visibleEvents : []}
                    selection={mapSelection}
                    onSelect={setMapSelection}
                    locationIsApproximate={Boolean(geoNote)}
                  />
                  <Text style={styles.mapHint}>Tap a pin for details · pinch or drag to explore</Text>
                  {mapSelection ? (
                    <View style={styles.mapSelectionCard}>
                      {mapSelection.kind === "business" ? (
                        <>
                          <Text style={styles.mapSelectionTitle}>{mapSelection.item.name}</Text>
                          {mapSelection.item.category ? (
                            <Text style={styles.mutedSmall}>{mapSelection.item.category}</Text>
                          ) : null}
                          {typeof mapSelection.item.distanceM === "number" ? (
                            <Text style={styles.mutedSmall}>{(mapSelection.item.distanceM / 1000).toFixed(1)} km away</Text>
                          ) : null}
                          <Pressable
                            style={styles.mapSelectionBtn}
                            onPress={() => navigation.navigate("BusinessDetail", { id: mapSelection.item.id })}
                          >
                            <Text style={styles.mapSelectionBtnText}>Open business</Text>
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <Text style={styles.mapSelectionTitle}>{mapSelection.item.title}</Text>
                          <Text style={styles.mutedSmall}>{new Date(mapSelection.item.startsAt).toLocaleString()}</Text>
                          {typeof mapSelection.item.distanceM === "number" ? (
                            <Text style={styles.mutedSmall}>{(mapSelection.item.distanceM / 1000).toFixed(1)} km away</Text>
                          ) : null}
                          <Pressable
                            style={styles.mapSelectionBtn}
                            onPress={() => navigation.navigate("EventDetail", { id: mapSelection.item.id })}
                          >
                            <Text style={styles.mapSelectionBtnText}>Open event</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  ) : null}
                </SectionCard>
                {nearQuery.isLoading ? <LoadingState label="Loading nearby…" /> : null}
                {nearQuery.error ? <ErrorState message={(nearQuery.error as Error).message} /> : null}
                {nearEventsQuery.isLoading ? <LoadingState label="Loading nearby events…" /> : null}
                {nearEventsQuery.error ? <ErrorState message={(nearEventsQuery.error as Error).message} /> : null}
                <SectionCard>
                  <Text style={styles.panelLabel}>Show</Text>
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
                </SectionCard>
                {(nearKind === "all" || nearKind === "events") ? (
                  <SectionCard>
                    <Text style={styles.panelLabel}>When</Text>
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
                  </SectionCard>
                ) : null}
                {(nearKind === "all" || nearKind === "events") && eventClusters.length > 0 ? (
                  <SectionCard title="Event clusters">
                    <View style={styles.clusterHeader}>
                      {selectedCluster ? (
                        <Pressable onPress={() => setSelectedCluster(null)}>
                          <Text style={styles.linkText}>Clear filter</Text>
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
                  </SectionCard>
                ) : null}
                <SectionCard title="Nearby">
                  {(nearQuery.data?.items || []).length === 0 &&
                  (nearEventsQuery.data?.items || []).length === 0 &&
                  !nearQuery.isLoading &&
                  !nearEventsQuery.isLoading ? (
                    <EmptyState
                      title="No nearby results"
                      subtitle={canUseBusinessDirectoryTools ? "Add your business from the link at the top." : "Try another time window or check back later."}
                    />
                  ) : null}
                  {(nearKind === "all" || nearKind === "businesses" ? nearQuery.data?.items || [] : []).map((biz) => (
                    <Pressable
                      key={biz.id}
                      style={styles.resultRow}
                      onPress={() => navigation.navigate("BusinessDetail", { id: biz.id })}
                    >
                      <View style={styles.flex1}>
                        <Text style={styles.item}>{biz.name}</Text>
                        <Text style={styles.muted}>Business</Text>
                        {typeof biz.distanceM === "number" ? (
                          <Text style={styles.muted}>{(biz.distanceM / 1000).toFixed(1)} km</Text>
                        ) : null}
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  ))}
                  {(nearKind === "all" || nearKind === "events" ? visibleEvents : []).map((event) => (
                    <Pressable
                      key={`event-${event.id}`}
                      style={styles.resultRow}
                      onPress={() => navigation.navigate("EventDetail", { id: event.id })}
                    >
                      <View style={styles.flex1}>
                        <Text style={styles.item}>{event.title}</Text>
                        <Text style={styles.muted}>Event · {new Date(event.startsAt).toLocaleDateString()}</Text>
                        {typeof event.distanceM === "number" ? (
                          <Text style={styles.muted}>{(event.distanceM / 1000).toFixed(1)} km</Text>
                        ) : null}
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  ))}
                </SectionCard>
              </>
            ) : null}
          </View>
        )}
      </ScrollView>
    </TabScreenRoot>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { gap: 14 },
  introRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 4,
    marginBottom: 4
  },
  introText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    fontWeight: "500"
  },
  headerLink: { paddingVertical: 6, paddingHorizontal: 4 },
  headerLinkText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  panelLabel: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 },
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
  searchRow: { flexDirection: "row", gap: 8 },
  flex1: { flex: 1 },
  hintPara: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  shortcutTile: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.control,
    padding: 14,
    backgroundColor: colors.subtleFill,
    gap: 4
  },
  shortcutTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  shortcutSub: { fontSize: 13, color: colors.muted, lineHeight: 18 },
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
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  buttonText: { color: colors.text, fontWeight: "600" },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    gap: 8
  },
  resultRowText: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.subtleFill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  avatarLetter: { fontSize: 16, fontWeight: "700", color: colors.text },
  item: { color: colors.text, fontWeight: "600" },
  postTypeTag: { fontSize: 11, fontWeight: "700", color: colors.muted, marginBottom: 4, textTransform: "uppercase" },
  muted: { color: colors.muted, fontSize: 12 },
  mutedSmall: { color: colors.muted, fontSize: 11, marginTop: 4 },
  chevron: { fontSize: 22, color: colors.muted, fontWeight: "300", paddingLeft: 4 },
  nearSection: { gap: 14 },
  note: { color: colors.danger, fontSize: 12, marginHorizontal: 20 },
  privacyNote: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  mapHint: { color: colors.muted, fontSize: 11, marginTop: 8, textAlign: "center" },
  mapSelectionCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.subtleFill,
    gap: 6
  },
  mapSelectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  mapSelectionBtn: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.accent
  },
  mapSelectionBtnText: { color: colors.onAccent, fontWeight: "700", fontSize: 13 },
  clusterHeader: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginBottom: 4 },
  linkText: { color: colors.accent, fontSize: 12, fontWeight: "700" }
});
