import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fetchSessionMe } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { fetchMyProducts, formatMinorCurrency } from "../../lib/monetization";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors, radii } from "../../theme";
import type { FeedItem } from "../../types";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { resolveMediaUrl } from "../../lib/media-url";
import {
  IconCamera,
  IconGrid,
  IconImages,
  IconLink,
  IconMenu,
  IconPlaySmall,
  IconPlus,
  IconShoppingBag
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
  const { width, height: viewportHeight } = useWindowDimensions();
  const compact = viewportHeight <= 700;
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [activeTab, setActiveTab] = useState<"posts" | "products">("posts");
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
        persona_capabilities?: {
          can_create_products?: boolean;
          can_use_business_directory_tools?: boolean;
        };
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
  const businessesMineQuery = useQuery({
    queryKey: ["mobile-businesses-mine"],
    queryFn: () => apiRequest<{ items: { id: number }[] }>("/businesses/mine", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const productsQuery = useQuery({
    queryKey: ["mobile-creator-products"],
    queryFn: () => fetchMyProducts(),
    enabled: Boolean(sessionQuery.data?.id)
  });

  const items = postsQuery.data?.items || [];
  const productItems = productsQuery.data?.items || [];
  const hasBusinessListing = (businessesMineQuery.data?.items?.length ?? 0) > 0;
  const avatarUri = resolveMediaUrl(profileQuery.data?.avatar_url);
  const tileSize = Math.floor((width - 2) / 3);
  const p = profileQuery.data;
  const canCreateProducts = Boolean(p?.persona_capabilities?.can_create_products);
  const canUseBusinessDirectoryTools = Boolean(p?.persona_capabilities?.can_use_business_directory_tools);
  const username = sessionQuery.data?.username || "user";

  useEffect(() => {
    if (!canCreateProducts && activeTab === "products") {
      setActiveTab("posts");
    }
  }, [activeTab, canCreateProducts]);

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
      <View style={[styles.topBar, compact && styles.topBarCompact, { paddingTop: insets.top + 4 }]}>
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
        contentContainerStyle={[
          styles.scrollContent,
          compact && styles.scrollContentCompact,
          {
            paddingBottom: tabBarHeight + Math.max(insets.bottom, 8) + (compact ? 20 : 28)
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        {sessionQuery.isLoading ? <LoadingState label="Loading profile..." /> : null}
        {sessionQuery.error ? <ErrorState message={(sessionQuery.error as Error).message} /> : null}
        {!sessionQuery.isLoading && !sessionQuery.error && !sessionQuery.data ? (
          <EmptyState title="Profile unavailable" />
        ) : null}

        {sessionQuery.data && p ? (
          <>
            <View style={[styles.heroRow, compact && styles.heroRowCompact]}>
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
                  <Text style={[styles.statNumber, compact && styles.statNumberCompact]}>{p.posts_count}</Text>
                  <Text style={[styles.statLabel, compact && styles.statLabelCompact]}>posts</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statNumber, compact && styles.statNumberCompact]}>{p.followers_count}</Text>
                  <Text style={[styles.statLabel, compact && styles.statLabelCompact]}>followers</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statNumber, compact && styles.statNumberCompact]}>{p.following_count}</Text>
                  <Text style={[styles.statLabel, compact && styles.statLabelCompact]}>following</Text>
                </View>
              </View>
            </View>

            <View style={[styles.bioBlock, compact && styles.bioBlockCompact]}>
              <Text style={[styles.displayName, compact && styles.displayNameCompact]}>{p.display_name}</Text>
              {p.business_offering ? (
                <Text style={[styles.categoryLine, compact && styles.categoryLineCompact]}>{p.business_offering}</Text>
              ) : null}
              {p.bio ? <Text style={[styles.bioText, compact && styles.bioTextCompact]}>{p.bio}</Text> : null}
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

            <View style={[styles.insightsCard, compact && styles.insightsCardCompact]}>
              <Text style={styles.insightsTitle}>Engagement</Text>
              <Text style={[styles.insightsSub, compact && styles.insightsSubCompact]}>
                {p.likes_received_count} received · {p.likes_given_count} given
              </Text>
            </View>

            <View style={[styles.ctaRow, compact && styles.ctaRowCompact]}>
              <Pressable
                style={[styles.ctaButton, styles.ctaButtonPrimary, styles.ctaButtonFlex]}
                onPress={() => navigation.navigate("EditProfile")}
              >
                <Text style={styles.ctaButtonPrimaryText}>Edit profile</Text>
              </Pressable>
              <Pressable style={[styles.ctaButton, styles.ctaButtonOutline, styles.ctaButtonFlex]} onPress={shareProfile}>
                <Text style={styles.ctaButtonOutlineText}>Share</Text>
              </Pressable>
            </View>

            {canUseBusinessDirectoryTools && !hasBusinessListing ? (
              <Pressable style={styles.addBusinessBtn} onPress={() => navigation.navigate("AddBusiness")}>
                <Text style={styles.addBusinessText}>List your business</Text>
              </Pressable>
            ) : null}

          </>
        ) : null}

        <View style={[styles.tabBar, compact && styles.tabBarCompact]}>
          <Pressable
            style={[styles.tabItem, compact && styles.tabItemCompact, activeTab === "posts" ? styles.tabItemActive : null]}
            onPress={() => setActiveTab("posts")}
          >
            <View style={styles.tabInner}>
              <IconGrid color={activeTab === "posts" ? colors.text : colors.muted} size={20} />
              <Text style={[styles.tabLabel, compact && styles.tabLabelCompact, activeTab === "posts" ? styles.tabLabelActive : null]}>Posts</Text>
            </View>
          </Pressable>
          {canCreateProducts ? (
            <Pressable
              style={[styles.tabItem, compact && styles.tabItemCompact, activeTab === "products" ? styles.tabItemActive : null]}
              onPress={() => setActiveTab("products")}
            >
              <View style={styles.tabInner}>
                <IconShoppingBag color={activeTab === "products" ? colors.text : colors.muted} size={20} />
                <Text style={[styles.tabLabel, compact && styles.tabLabelCompact, activeTab === "products" ? styles.tabLabelActive : null]}>Shop</Text>
              </View>
            </Pressable>
          ) : null}
        </View>

        {activeTab === "posts" ? (
          <>
            {postsQuery.isLoading ? <LoadingState label="Loading posts..." /> : null}
            {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
            {!postsQuery.isLoading && !postsQuery.error && items.length === 0 ? (
              <View style={styles.emptyGrid}>
                <IconImages color={colors.muted} size={48} />
                <Text style={styles.emptyGridTitle}>No posts yet</Text>
                <Text style={styles.emptyGridSub}>Start from the Create tab.</Text>
              </View>
            ) : null}
            <View style={styles.grid}>
              {items.map((item) => {
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
          </>
        ) : (
          <>
            {productsQuery.isLoading ? <LoadingState label="Loading products..." /> : null}
            {productsQuery.error ? <ErrorState message={(productsQuery.error as Error).message} /> : null}
            {!productsQuery.isLoading && !productsQuery.error && productItems.length === 0 ? (
              <View style={styles.emptyGrid}>
                <IconShoppingBag color={colors.muted} size={48} />
                <Text style={styles.emptyGridTitle}>No products yet</Text>
                <Text style={styles.emptyGridSub}>Add a product under Settings → Pro tools.</Text>
              </View>
            ) : null}
            <View style={styles.grid}>
              {productItems.map((prod) => (
                <Pressable
                  key={prod.id}
                  style={[styles.tile, styles.productTile, { width: tileSize, minHeight: tileSize }]}
                  onPress={() => navigation.navigate("ProductDetail", { productId: prod.id })}
                >
                  <Text style={styles.productTileTitle} numberOfLines={3}>
                    {prod.title}
                  </Text>
                  <Text style={styles.productTilePrice}>
                    {formatMinorCurrency(Number(prod.price_minor || 0), prod.currency || "usd")}
                  </Text>
                  {prod.status !== "published" ? (
                    <Text style={styles.productTileStatus}>{prod.status}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.atmosphere
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surface
  },
  topBarCompact: {
    paddingBottom: 8
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
    gap: 2,
    maxWidth: "50%"
  },
  topBarUsername: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.surface
  },
  scrollContent: {
    paddingBottom: 32
  },
  scrollContentCompact: {
    paddingBottom: 24
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 16
  },
  heroRowCompact: {
    paddingTop: 10,
    gap: 12
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
  statNumberCompact: {
    fontSize: 16
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2
  },
  statLabelCompact: {
    fontSize: 11
  },
  bioBlock: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 4
  },
  bioBlockCompact: {
    paddingTop: 10
  },
  displayName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text
  },
  displayNameCompact: {
    fontSize: 14
  },
  categoryLine: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "500"
  },
  categoryLineCompact: {
    fontSize: 12
  },
  bioText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginTop: 4
  },
  bioTextCompact: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2
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
    marginTop: 12,
    padding: 14,
    borderRadius: radii.panel,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 10
      },
      android: { elevation: 1 }
    })
  },
  insightsCardCompact: {
    marginTop: 10,
    padding: 12
  },
  insightsTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  insightsSub: {
    fontSize: 14,
    color: colors.text,
    marginTop: 6,
    lineHeight: 20,
    letterSpacing: -0.2
  },
  insightsSubCompact: {
    fontSize: 13,
    marginTop: 4
  },
  ctaRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 14
  },
  ctaRowCompact: {
    marginTop: 10,
    gap: 8
  },
  ctaButton: {
    borderRadius: radii.control,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  ctaButtonPrimary: {
    backgroundColor: colors.accent,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent
  },
  ctaButtonOutline: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  ctaButtonFlex: {
    flex: 1
  },
  ctaButtonPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.onAccent,
    letterSpacing: -0.2
  },
  ctaButtonOutlineText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    letterSpacing: -0.2
  },
  addBusinessBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  addBusinessText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accent,
    letterSpacing: -0.2
  },
  tabBar: {
    flexDirection: "row",
    marginTop: 18,
    marginHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    padding: 4,
    gap: 6
  },
  tabBarCompact: {
    marginTop: 14,
    padding: 3,
    gap: 4
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: radii.control,
    borderBottomWidth: 0,
    borderBottomColor: "transparent"
  },
  tabItemCompact: {
    paddingVertical: 7
  },
  tabItemActive: {
    backgroundColor: colors.subtleFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  tabInner: { alignItems: "center", gap: 4 },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: 0.2
  },
  tabLabelCompact: {
    fontSize: 10
  },
  tabLabelActive: {
    color: colors.accent
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
  productTile: {
    padding: 8,
    justifyContent: "center",
    alignItems: "stretch"
  },
  productTileTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text
  },
  productTilePrice: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.accent,
    marginTop: 6
  },
  productTileStatus: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 4,
    textTransform: "capitalize"
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
