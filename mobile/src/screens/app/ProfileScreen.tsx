import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fetchSessionMe } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors, radii } from "../../theme";
import type { FeedItem } from "../../types";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { resolveMediaUrl } from "../../lib/media-url";
import {
  IconCamera,
  IconChevronDown,
  IconFilm,
  IconGrid,
  IconImages,
  IconLink,
  IconMenu,
  IconPlaySmall,
  IconPlus
} from "../../components/profile-ui-icons";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "AccountTab">,
  NativeStackScreenProps<RootStackParamList>
>;

const AVATAR_SIZE = 86;

function normalizeWebsiteUrl(raw: string) {
  const t = raw.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function ProfileScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<"posts" | "media">("posts");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ["mobile-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const profileQuery = useQuery({
    queryKey: ["mobile-account-profile"],
    queryFn: () =>
      apiRequest<{
        user_id: number;
        display_name: string;
        bio: string | null;
        avatar_url?: string | null;
        business_offering?: string | null;
        website_url?: string | null;
        posts_count: number;
        followers_count: number;
        following_count: number;
        likes_received_count: number;
        likes_given_count: number;
      }>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const postsQuery = useQuery({
    queryKey: ["mobile-account-posts", sessionQuery.data?.id],
    queryFn: () =>
      apiRequest<{ items: FeedItem[] }>(`/feed?authorId=${sessionQuery.data?.id}&limit=40`, {
        auth: true
      }),
    enabled: Boolean(sessionQuery.data?.id)
  });

  const items = postsQuery.data?.items || [];
  const visibleItems = activeTab === "media" ? items.filter((item) => Boolean(item.media_url)) : items;
  const avatarUri = resolveMediaUrl(profileQuery.data?.avatar_url);
  const tileSize = Math.floor((width - 2) / 3);
  const p = profileQuery.data;
  const username = sessionQuery.data?.username || "user";

  const shareProfile = useCallback(async () => {
    try {
      await Share.share({
        message: `Connect with @${username} on Deenly — a Muslim social and marketplace community.`,
        title: "Deenly profile"
      });
    } catch {
      /* user dismissed */
    }
  }, [username]);

  const uploadAvatar = async () => {
    if (!profileQuery.data) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["image/*"],
      copyToCacheDirectory: true
    });
    if (picked.canceled || picked.assets.length === 0) {
      return;
    }
    const file = picked.assets[0];
    setAvatarUploading(true);
    try {
      const signature = await apiRequest<{
        uploadUrl: string;
        headers: Record<string, string>;
        key: string;
      }>("/media/upload-signature", {
        method: "POST",
        auth: true,
        body: {
          mediaType: "image",
          mimeType: file.mimeType || "image/jpeg",
          originalFilename: file.name || "avatar.jpg",
          fileSizeBytes: file.size || 1
        }
      });
      const fileResponse = await fetch(file.uri);
      const fileBlob = await fileResponse.blob();
      const uploadResponse = await fetch(signature.uploadUrl, {
        method: "PUT",
        headers: signature.headers,
        body: fileBlob
      });
      if (!uploadResponse.ok) {
        throw new Error("Unable to upload profile photo.");
      }
      await apiRequest("/users/me", {
        method: "PUT",
        auth: true,
        body: {
          displayName: profileQuery.data.display_name,
          bio: profileQuery.data.bio,
          avatarUrl: signature.key,
          businessOffering: profileQuery.data.business_offering ?? null,
          websiteUrl: profileQuery.data.website_url ?? null
        }
      });
      await queryClient.invalidateQueries({ queryKey: ["mobile-account-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-feed"] });
    } finally {
      setAvatarUploading(false);
    }
  };

  const websiteHref = p?.website_url ? normalizeWebsiteUrl(p.website_url) : null;

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable
          style={styles.topBarHit}
          onPress={() => navigation.navigate("CreateTab")}
          accessibilityRole="button"
          accessibilityLabel="Create post"
        >
          <IconPlus color={colors.text} size={32} />
        </Pressable>
        <View style={styles.topBarTitleWrap}>
          <Text style={styles.topBarUsername} numberOfLines={1}>
            @{username}
          </Text>
          <View style={styles.topBarChevron}>
            <IconChevronDown color={colors.muted} size={14} />
          </View>
        </View>
        <Pressable
          style={styles.topBarHit}
          onPress={() => navigation.navigate("Settings")}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <IconMenu color={colors.text} size={26} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {sessionQuery.isLoading ? <LoadingState label="Loading profile..." /> : null}
        {sessionQuery.error ? <ErrorState message={(sessionQuery.error as Error).message} /> : null}
        {!sessionQuery.isLoading && !sessionQuery.error && !sessionQuery.data ? (
          <EmptyState title="Profile unavailable" />
        ) : null}

        {sessionQuery.data && p ? (
          <>
            <View style={styles.heroRow}>
              <Pressable onPress={uploadAvatar} disabled={avatarUploading} style={styles.avatarWrap}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarLetter}>
                      {(p.display_name || username).slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.avatarBadge}>
                  <IconCamera color={colors.onAccent} size={14} />
                </View>
                {avatarUploading ? (
                  <View style={styles.avatarUploading}>
                    <Text style={styles.avatarUploadingText}>…</Text>
                  </View>
                ) : null}
              </Pressable>
              <View style={styles.statsRow}>
                <View style={styles.statCell}>
                  <Text style={styles.statNumber}>{p.posts_count}</Text>
                  <Text style={styles.statLabel}>posts</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statNumber}>{p.followers_count}</Text>
                  <Text style={styles.statLabel}>followers</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statNumber}>{p.following_count}</Text>
                  <Text style={styles.statLabel}>following</Text>
                </View>
              </View>
            </View>

            <View style={styles.bioBlock}>
              <Text style={styles.displayName}>{p.display_name}</Text>
              {p.business_offering ? (
                <Text style={styles.categoryLine}>{p.business_offering}</Text>
              ) : null}
              {p.bio ? <Text style={styles.bioText}>{p.bio}</Text> : null}
              {websiteHref ? (
                <Pressable
                  style={styles.websiteRow}
                  onPress={() => Linking.openURL(websiteHref).catch(() => null)}
                >
                  <IconLink color={colors.accent} size={16} />
                  <Text style={styles.websiteText} numberOfLines={1}>
                    {p.website_url?.replace(/^https?:\/\//i, "")}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.insightsCard}>
              <Text style={styles.insightsTitle}>On Deenly</Text>
              <Text style={styles.insightsSub}>
                {p.likes_received_count} hearts from the community · {p.likes_given_count} you have given
              </Text>
            </View>

            <View style={styles.ctaRow}>
              <Pressable
                style={[styles.ctaButton, styles.ctaButtonFlex]}
                onPress={() => navigation.navigate("Settings")}
              >
                <Text style={styles.ctaButtonText}>Edit profile</Text>
              </Pressable>
              <Pressable style={[styles.ctaButton, styles.ctaButtonFlex]} onPress={shareProfile}>
                <Text style={styles.ctaButtonText}>Share profile</Text>
              </Pressable>
            </View>

            <Pressable style={styles.addBusinessBtn} onPress={() => navigation.navigate("AddBusiness")}>
              <Text style={styles.addBusinessText}>Add your business</Text>
            </Pressable>

            <Pressable style={styles.addBusinessBtn} onPress={() => navigation.navigate("CreatorEconomy")}>
              <Text style={styles.addBusinessText}>Creator hub</Text>
            </Pressable>

            <Pressable style={styles.feedPrefsLink} onPress={() => navigation.navigate("Onboarding")}>
              <Text style={styles.feedPrefsText}>Feed & discovery preferences</Text>
            </Pressable>
          </>
        ) : null}

        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tabItem, activeTab === "posts" ? styles.tabItemActive : null]}
            onPress={() => setActiveTab("posts")}
          >
            <IconGrid color={activeTab === "posts" ? colors.text : colors.muted} size={22} />
          </Pressable>
          <Pressable
            style={[styles.tabItem, activeTab === "media" ? styles.tabItemActive : null]}
            onPress={() => setActiveTab("media")}
          >
            <IconFilm color={activeTab === "media" ? colors.text : colors.muted} size={22} />
          </Pressable>
        </View>

        {postsQuery.isLoading ? <LoadingState label="Loading posts..." /> : null}
        {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
        {!postsQuery.isLoading && !postsQuery.error && visibleItems.length === 0 ? (
          <View style={styles.emptyGrid}>
            <IconImages color={colors.muted} size={48} />
            <Text style={styles.emptyGridTitle}>
              {activeTab === "posts" ? "No posts yet" : "No media yet"}
            </Text>
            <Text style={styles.emptyGridSub}>Share something beneficial from the Create tab.</Text>
          </View>
        ) : null}

        <View style={styles.grid}>
          {visibleItems.map((item) => {
            const mediaUrl = resolveMediaUrl(item.media_url);
            const isImage = Boolean(item.media_mime_type?.startsWith("image/"));
            const isVideo = Boolean(item.media_mime_type?.startsWith("video/"));
            const fallbackLabel = item.content?.trim().slice(0, 20) || "Post";
            return (
              <Pressable
                key={item.id}
                style={[styles.tile, { width: tileSize, height: tileSize }]}
                onPress={() => navigation.navigate("PostDetail", { id: item.id })}
              >
                {mediaUrl && isImage ? (
                  <Image source={{ uri: mediaUrl }} style={styles.tileImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.tileFallback, isVideo ? styles.tileFallbackVideo : null]}>
                    <Text style={styles.tileFallbackText}>{isVideo ? "Video" : fallbackLabel}</Text>
                  </View>
                )}
                {isVideo ? (
                  <View style={styles.tileBadge}>
                    <IconPlaySmall color={colors.text} size={10} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface
  },
  topBarHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  topBarTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "50%"
  },
  topBarUsername: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text
  },
  topBarChevron: {
    marginTop: 2
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.surface
  },
  scrollContent: {
    paddingBottom: 32
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 20
  },
  avatarWrap: {
    position: "relative"
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.subtleFill
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center"
  },
  avatarLetter: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.muted
  },
  avatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface
  },
  avatarUploading: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarUploadingText: {
    fontWeight: "700",
    color: colors.text
  },
  statsRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center"
  },
  statCell: {
    alignItems: "center",
    minWidth: 72
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2
  },
  bioBlock: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 4
  },
  displayName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text
  },
  categoryLine: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "500"
  },
  bioText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginTop: 4
  },
  websiteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    alignSelf: "flex-start"
  },
  websiteText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accent,
    flexShrink: 1
  },
  insightsCard: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    borderRadius: radii.control,
    backgroundColor: colors.subtleFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  insightsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text
  },
  insightsSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 17
  },
  ctaRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 14
  },
  ctaButton: {
    borderRadius: radii.control,
    backgroundColor: colors.subtleFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  ctaButtonFlex: {
    flex: 1
  },
  ctaButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text
  },
  addBusinessBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  addBusinessText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.accent
  },
  feedPrefsLink: {
    marginHorizontal: 16,
    marginTop: 4,
    paddingVertical: 8,
    alignItems: "center"
  },
  feedPrefsText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted
  },
  tabBar: {
    flexDirection: "row",
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent"
  },
  tabItemActive: {
    borderBottomColor: colors.accent
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 1,
    backgroundColor: colors.border
  },
  tile: {
    overflow: "hidden",
    backgroundColor: colors.card
  },
  tileImage: {
    width: "100%",
    height: "100%"
  },
  tileFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: 6
  },
  tileFallbackVideo: {
    backgroundColor: "#1f2937"
  },
  tileFallbackText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center"
  },
  tileBadge: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)"
  },
  emptyGrid: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 8
  },
  emptyGridTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text
  },
  emptyGridSub: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center"
  }
});
