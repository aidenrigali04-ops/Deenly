import { useCallback, useEffect, useState } from "react";
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
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabScreenProps, useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fetchSessionMe } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { fetchMyProducts, formatMinorCurrency } from "../../lib/monetization";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors, figmaMobile, figmaMobileProfile, spacing, type as typeStyles } from "../../theme";
import type { FeedItem } from "../../types";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { resolveMediaUrl } from "../../lib/media-url";
import {
  IconCamera,
  IconGrid,
  IconImages,
  IconMenu,
  IconPlaySmall,
  IconPlus,
  IconShoppingBag
} from "../../components/profile-ui-icons";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "AccountTab">,
  NativeStackScreenProps<RootStackParamList>
>;

function formatProfileStatCount(n: number) {
  try {
    return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
}

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
  const gridPad = figmaMobileProfile.gridPadH;
  const gridGap = figmaMobileProfile.gridGap;
  const tileWidth = Math.max(96, Math.floor((width - gridPad * 2 - gridGap * 2) / 3));
  const tileHeight = Math.round(tileWidth * (211 / 111));
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
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={styles.profileOrb} />
      </View>
      <StatusBar style="light" />
      <View style={[styles.topBar, compact && styles.topBarCompact, { paddingTop: insets.top + 6 }]}>
        <Pressable
          style={styles.topBarHit}
          onPress={() => navigation.navigate("CreateFlow", { screen: "CreateHub" })}
          accessibilityRole="button"
          accessibilityLabel="Create post"
        >
          <IconPlus color={figmaMobile.text} size={26} />
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
          <IconMenu color={figmaMobile.text} size={26} />
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
        {sessionQuery.isLoading ? <LoadingState label="Loading profile..." surface="dark" /> : null}
        {sessionQuery.error ? <ErrorState message={(sessionQuery.error as Error).message} surface="dark" /> : null}
        {!sessionQuery.isLoading && !sessionQuery.error && !sessionQuery.data ? (
          <EmptyState title="Profile unavailable" surface="dark" />
        ) : null}

        {sessionQuery.data && p ? (
          <>
            <View style={[styles.heroBlock, compact && styles.heroBlockCompact]}>
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
              <View style={styles.heroMeta}>
                <Text style={[styles.profileDisplayName, compact && styles.profileDisplayNameCompact]} numberOfLines={2}>
                  {p.display_name}
                </Text>
                <Text style={styles.profileUsername}>@{username}</Text>
                <View style={styles.heroPills}>
                  <Pressable
                    style={({ pressed }) => [styles.heroPill, pressed && styles.heroPillPressed]}
                    onPress={() => navigation.navigate("EditProfile")}
                  >
                    <Text style={styles.heroPillText}>Edit profile</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.heroPill, pressed && styles.heroPillPressed]} onPress={shareProfile}>
                    <Text style={styles.heroPillTextGold}>Share</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={[styles.infoPanel, compact && styles.infoPanelCompact]}>
              <View style={[styles.statsStrip, compact && styles.statsStripCompact]}>
                <View style={styles.statCol}>
                  <Text style={styles.statNum}>{formatProfileStatCount(p.posts_count)}</Text>
                  <Text style={styles.statLbl}>Post</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statNum}>{formatProfileStatCount(p.followers_count)}</Text>
                  <Text style={styles.statLbl}>Followers</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statNum}>{formatProfileStatCount(p.following_count)}</Text>
                  <Text style={styles.statLbl}>Following</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statNum}>{formatProfileStatCount(p.likes_received_count)}</Text>
                  <Text style={styles.statLbl}>Likes</Text>
                </View>
              </View>
              <View style={styles.infoBody}>
                {p.business_offering ? <Text style={styles.infoBioLine}>{p.business_offering}</Text> : null}
                {p.bio ? <Text style={styles.infoBioLine}>{p.bio}</Text> : null}
                {websiteHref ? (
                  <Pressable onPress={() => Linking.openURL(websiteHref).catch(() => null)}>
                    <Text style={styles.infoBioLine}>
                      Visit us:{" "}
                      <Text style={styles.infoBioLink}>{p.website_url?.replace(/^https?:\/\//i, "")}</Text>
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {canUseBusinessDirectoryTools && !hasBusinessListing ? (
              <Pressable style={styles.addBusinessBtn} onPress={() => navigation.navigate("AddBusiness")}>
                <Text style={styles.addBusinessText}>List your business</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        <View style={[styles.profileTabRail, compact && styles.profileTabRailCompact]}>
          <Pressable style={styles.profileTabHit} onPress={() => setActiveTab("posts")}>
            <View style={styles.profileTabInner}>
              <IconGrid
                color={activeTab === "posts" ? figmaMobile.accentGold : figmaMobileProfile.statLabelColor}
                size={figmaMobileProfile.contentTabIcon}
              />
              <Text style={[styles.profileTabLabel, activeTab === "posts" ? styles.profileTabLabelActive : null]}>Posts</Text>
            </View>
          </Pressable>
          {canCreateProducts ? (
            <Pressable style={styles.profileTabHit} onPress={() => setActiveTab("products")}>
              <View style={styles.profileTabInner}>
                <IconShoppingBag
                  color={activeTab === "products" ? figmaMobile.accentGold : figmaMobileProfile.statLabelColor}
                  size={figmaMobileProfile.contentTabIcon}
                />
                <Text style={[styles.profileTabLabel, activeTab === "products" ? styles.profileTabLabelActive : null]}>
                  Products
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>

        {activeTab === "posts" ? (
          <>
            {postsQuery.isLoading ? <LoadingState label="Loading posts..." surface="dark" /> : null}
            {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} surface="dark" /> : null}
            {!postsQuery.isLoading && !postsQuery.error && items.length === 0 ? (
              <View style={styles.emptyGrid}>
                <IconImages color={figmaMobile.textMuted} size={48} />
                <Text style={styles.emptyGridTitle}>No posts yet</Text>
                <Text style={styles.emptyGridSub}>Tap + above to create a post or reel.</Text>
              </View>
            ) : null}
            <View style={styles.profileGrid}>
              {items.map((item) => {
                const mediaUrl = resolveMediaUrl(item.media_url);
                const isImage = Boolean(item.media_mime_type?.startsWith("image/"));
                const isVideo = Boolean(item.media_mime_type?.startsWith("video/"));
                const fallbackLabel = item.content?.trim().slice(0, 20) || "Post";
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.tile, { width: tileWidth, height: tileHeight }]}
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
                        <IconPlaySmall color={figmaMobile.text} size={10} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <>
            {productsQuery.isLoading ? <LoadingState label="Loading products..." surface="dark" /> : null}
            {productsQuery.error ? <ErrorState message={(productsQuery.error as Error).message} surface="dark" /> : null}
            {!productsQuery.isLoading && !productsQuery.error && productItems.length === 0 ? (
              <View style={styles.emptyGrid}>
                <IconShoppingBag color={figmaMobile.textMuted} size={48} />
                <Text style={styles.emptyGridTitle}>No products yet</Text>
                <Text style={styles.emptyGridSub}>Add a product under Settings → Pro tools.</Text>
              </View>
            ) : null}
            <View style={styles.profileGrid}>
              {productItems.map((prod) => (
                <Pressable
                  key={prod.id}
                  style={[styles.tile, styles.productTile, { width: tileWidth, minHeight: tileHeight }]}
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
    backgroundColor: "transparent",
    overflow: "hidden"
  },
  profileOrb: {
    position: "absolute",
    width: figmaMobileProfile.accentOrbSize,
    height: figmaMobileProfile.accentOrbSize,
    borderRadius: figmaMobileProfile.accentOrbSize / 2,
    backgroundColor: figmaMobileProfile.accentOrb,
    top: figmaMobileProfile.accentOrbTop,
    left: figmaMobileProfile.accentOrbLeft
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: 12,
    borderBottomWidth: 0,
    backgroundColor: "transparent"
  },
  topBarCompact: {
    paddingBottom: 10
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
    maxWidth: "58%",
    justifyContent: "center"
  },
  topBarUsername: {
    ...typeStyles.navChromeTitle,
    color: figmaMobile.text
  },
  scroll: {
    flex: 1,
    backgroundColor: "transparent"
  },
  scrollContent: {
    paddingBottom: 32
  },
  scrollContentCompact: {
    paddingBottom: 24
  },
  heroBlock: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: figmaMobileProfile.heroPadH,
    paddingTop: 18,
    gap: figmaMobileProfile.heroGap
  },
  heroBlockCompact: {
    paddingTop: 12,
    gap: 12
  },
  heroMeta: {
    flex: 1,
    minWidth: 0,
    gap: figmaMobileProfile.nameColumnGap
  },
  profileDisplayName: {
    fontSize: figmaMobileProfile.displayNameSize,
    fontWeight: "600",
    lineHeight: figmaMobileProfile.displayNameLineHeight,
    color: figmaMobile.text,
    letterSpacing: -0.2
  },
  profileDisplayNameCompact: {
    fontSize: 17,
    lineHeight: 22
  },
  profileUsername: {
    fontSize: figmaMobileProfile.usernameSize,
    fontWeight: "400",
    lineHeight: figmaMobileProfile.usernameLineHeight,
    color: figmaMobileProfile.usernameColor
  },
  heroPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2
  },
  heroPill: {
    paddingHorizontal: figmaMobileProfile.pillPadH,
    paddingVertical: figmaMobileProfile.pillPadV,
    borderRadius: figmaMobileProfile.pillRadius,
    backgroundColor: figmaMobileProfile.pillBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: figmaMobileProfile.pillBorder
  },
  heroPillPressed: {
    opacity: 0.88
  },
  heroPillText: {
    fontSize: figmaMobileProfile.pillTextSize,
    fontWeight: "500",
    lineHeight: figmaMobileProfile.pillTextLineHeight,
    color: figmaMobile.text
  },
  heroPillTextGold: {
    fontSize: figmaMobileProfile.pillTextSize,
    fontWeight: "500",
    lineHeight: figmaMobileProfile.pillTextLineHeight,
    color: figmaMobile.accentGold
  },
  infoPanel: {
    marginHorizontal: figmaMobileProfile.heroPadH,
    marginTop: 18,
    paddingTop: figmaMobileProfile.infoPanelPadTop,
    paddingBottom: figmaMobileProfile.infoPanelPadBottom,
    paddingHorizontal: figmaMobileProfile.infoPanelPadH,
    borderRadius: figmaMobileProfile.infoPanelRadius,
    backgroundColor: figmaMobileProfile.infoPanelBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: figmaMobileProfile.infoPanelBorder,
    gap: figmaMobileProfile.infoPanelGap
  },
  infoPanelCompact: {
    marginTop: 14,
    paddingTop: 20,
    paddingBottom: 22,
    paddingHorizontal: 18
  },
  statsStrip: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: figmaMobileProfile.statColumnsGap,
    paddingBottom: figmaMobileProfile.statsRowPadBottom,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: figmaMobileProfile.statsRowBorder
  },
  statsStripCompact: {
    gap: 10
  },
  statCol: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: figmaMobileProfile.statStackGap
  },
  statNum: {
    fontSize: figmaMobileProfile.statNumberSize,
    fontWeight: "500",
    lineHeight: figmaMobileProfile.statNumberLineHeight,
    color: figmaMobile.text,
    fontVariant: ["tabular-nums"],
    textAlign: "center"
  },
  statLbl: {
    fontSize: figmaMobileProfile.statLabelSize,
    fontWeight: "500",
    lineHeight: figmaMobileProfile.statLabelLineHeight,
    color: figmaMobileProfile.statLabelColor,
    textAlign: "center"
  },
  infoBody: {
    gap: 2,
    alignSelf: "stretch"
  },
  infoBioLine: {
    fontSize: figmaMobileProfile.bioTextSize,
    fontWeight: "500",
    lineHeight: figmaMobileProfile.bioLineHeight,
    color: figmaMobile.text
  },
  infoBioLink: {
    color: figmaMobile.linkCyan,
    fontWeight: "500"
  },
  addBusinessBtn: {
    marginHorizontal: spacing.screenHorizontal,
    marginTop: 12,
    paddingVertical: 10,
    alignItems: "center"
  },
  addBusinessText: {
    fontSize: 14,
    fontWeight: "600",
    color: figmaMobile.accentGold,
    letterSpacing: -0.2
  },
  profileTabRail: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: figmaMobileProfile.contentTabGap,
    marginTop: 24,
    marginBottom: 4,
    paddingHorizontal: figmaMobileProfile.heroPadH
  },
  profileTabRailCompact: {
    marginTop: 18,
    gap: 28
  },
  profileTabHit: {
    minWidth: 56,
    paddingVertical: 6,
    alignItems: "center"
  },
  profileTabInner: {
    alignItems: "center",
    gap: 6
  },
  profileTabLabel: {
    fontSize: figmaMobileProfile.contentTabLabelSize,
    fontWeight: "500",
    lineHeight: figmaMobileProfile.contentTabLabelLineHeight,
    color: figmaMobileProfile.statLabelColor,
    textAlign: "center"
  },
  profileTabLabelActive: {
    color: figmaMobile.accentGold,
    fontWeight: "500"
  },
  avatarWrap: {
    position: "relative"
  },
  avatar: {
    width: figmaMobileProfile.avatarSize,
    height: figmaMobileProfile.avatarSize,
    borderRadius: figmaMobileProfile.avatarRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: figmaMobileProfile.pillBorder,
    backgroundColor: "#FFFFFF"
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  avatarLetter: {
    fontSize: 36,
    fontWeight: "700",
    color: figmaMobile.avatarInitialInk
  },
  avatarBadge: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: figmaMobile.canvas
  },
  avatarUploading: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: figmaMobileProfile.avatarRadius,
    backgroundColor: figmaMobile.gradientBottom,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarUploadingText: {
    fontWeight: "700",
    color: figmaMobile.text,
    fontSize: 18
  },
  profileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: figmaMobileProfile.gridGap,
    paddingHorizontal: figmaMobileProfile.gridPadH,
    paddingTop: 4,
    backgroundColor: "transparent"
  },
  tile: {
    overflow: "hidden",
    borderRadius: figmaMobileProfile.gridTileRadius,
    backgroundColor: figmaMobileProfile.gridTileBg
  },
  tileImage: {
    width: "100%",
    height: "100%"
  },
  tileFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: figmaMobileProfile.gridTileBg,
    paddingHorizontal: 6
  },
  tileFallbackVideo: {
    backgroundColor: figmaMobileProfile.gridTileBg
  },
  tileFallbackText: {
    color: figmaMobile.textMuted,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center"
  },
  tileBadge: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.52)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: figmaMobile.glassBorder
  },
  productTile: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "stretch"
  },
  productTileTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: figmaMobile.text,
    letterSpacing: -0.1,
    lineHeight: 16
  },
  productTilePrice: {
    fontSize: 12,
    fontWeight: "600",
    color: figmaMobile.accentGold,
    marginTop: 8,
    letterSpacing: -0.05
  },
  productTileStatus: {
    fontSize: 10,
    fontWeight: "600",
    color: figmaMobile.textMuted,
    marginTop: 4,
    textTransform: "capitalize"
  },
  emptyGrid: {
    alignItems: "center",
    paddingVertical: 44,
    paddingHorizontal: spacing.breathing,
    gap: 10
  },
  emptyGridTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: figmaMobile.text
  },
  emptyGridSub: {
    fontSize: 14,
    color: figmaMobile.textMuted,
    textAlign: "center"
  }
});
