import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocumentPickerAsset } from "expo-document-picker";
import {
  ActivityIndicator,
  Alert,
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
import { apiRequest, ApiError } from "../../lib/api";
import { useRewardsWalletMeQuery } from "../../hooks/use-rewards-wallet";
import { fetchMyProducts, formatMinorCurrency } from "../../lib/monetization";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors, resolveFigmaMobile, resolveFigmaProfile, spacing, type as typeStyles } from "../../theme";
import { useAppChrome } from "../../lib/use-app-chrome";
import type { FeedItem } from "../../types";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { resolveMediaUrl } from "../../lib/media-url";
import { usePoints } from "../../features/points";
import { pickVisualMedia } from "../../lib/pick-visual-media";
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

function formatWalletPointsDisplay(raw: string): string {
  try {
    return BigInt(raw).toLocaleString("en-US");
  } catch {
    return raw;
  }
}

function formatWalletWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function normalizeWebsiteUrl(raw: string) {
  const t = raw.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function assetLooksLikeImage(asset: Pick<DocumentPickerAsset, "mimeType" | "name">) {
  const mimeType = String(asset.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) {
    return true;
  }
  const name = String(asset.name || "").toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(name);
}

function buildProfileStyles(fig: ReturnType<typeof resolveFigmaMobile>, fp: ReturnType<typeof resolveFigmaProfile>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: "transparent",
      overflow: "hidden"
    },
    profileOrb: {
      position: "absolute",
      width: fp.accentOrbSize,
      height: fp.accentOrbSize,
      borderRadius: fp.accentOrbSize / 2,
      backgroundColor: fp.accentOrb,
      top: fp.accentOrbTop,
      left: fp.accentOrbLeft
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
      color: fig.text
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
      paddingHorizontal: fp.heroPadH,
      paddingTop: 18,
      gap: fp.heroGap
    },
    heroBlockCompact: {
      paddingTop: 12,
      gap: 12
    },
    heroMeta: {
      flex: 1,
      minWidth: 0,
      gap: fp.nameColumnGap
    },
    profileDisplayName: {
      fontSize: fp.displayNameSize,
      fontWeight: "600",
      lineHeight: fp.displayNameLineHeight,
      color: fig.text,
      letterSpacing: -0.2
    },
    profileDisplayNameCompact: {
      fontSize: 17,
      lineHeight: 22
    },
    profileUsername: {
      fontSize: fp.usernameSize,
      fontWeight: "400",
      lineHeight: fp.usernameLineHeight,
      color: fp.usernameColor
    },
    heroPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
      marginTop: 2
    },
    heroPill: {
      paddingHorizontal: fp.pillPadH,
      paddingVertical: fp.pillPadV,
      borderRadius: fp.pillRadius,
      backgroundColor: fp.pillBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: fp.pillBorder
    },
    heroPillPressed: {
      opacity: 0.88
    },
    heroPillText: {
      fontSize: fp.pillTextSize,
      fontWeight: "500",
      lineHeight: fp.pillTextLineHeight,
      color: fig.text
    },
    heroPillTextGold: {
      fontSize: fp.pillTextSize,
      fontWeight: "500",
      lineHeight: fp.pillTextLineHeight,
      color: fig.accentGold
    },
    infoPanel: {
      marginHorizontal: fp.heroPadH,
      marginTop: 18,
      paddingTop: fp.infoPanelPadTop,
      paddingBottom: fp.infoPanelPadBottom,
      paddingHorizontal: fp.infoPanelPadH,
      borderRadius: fp.infoPanelRadius,
      backgroundColor: fp.infoPanelBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: fp.infoPanelBorder,
      gap: fp.infoPanelGap
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
      gap: fp.statColumnsGap,
      paddingBottom: fp.statsRowPadBottom,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: fp.statsRowBorder
    },
    statsStripCompact: {
      gap: 10
    },
    statCol: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      gap: fp.statStackGap
    },
    statNum: {
      fontSize: fp.statNumberSize,
      fontWeight: "500",
      lineHeight: fp.statNumberLineHeight,
      color: fig.text,
      fontVariant: ["tabular-nums"],
      textAlign: "center"
    },
    statLbl: {
      fontSize: fp.statLabelSize,
      fontWeight: "500",
      lineHeight: fp.statLabelLineHeight,
      color: fp.statLabelColor,
      textAlign: "center"
    },
    infoBody: {
      gap: 2,
      alignSelf: "stretch"
    },
    infoBioLine: {
      fontSize: fp.bioTextSize,
      fontWeight: "500",
      lineHeight: fp.bioLineHeight,
      color: fig.text
    },
    infoBioLink: {
      color: fig.linkCyan,
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
      color: fig.accentGold,
      letterSpacing: -0.2
    },
    profileTabRail: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "flex-start",
      gap: fp.contentTabGap,
      marginTop: 24,
      marginBottom: 4,
      paddingHorizontal: fp.heroPadH
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
      fontSize: fp.contentTabLabelSize,
      fontWeight: "500",
      lineHeight: fp.contentTabLabelLineHeight,
      color: fp.statLabelColor,
      textAlign: "center"
    },
    profileTabLabelActive: {
      color: fig.accentGold,
      fontWeight: "500"
    },
    avatarWrap: {
      position: "relative"
    },
    avatar: {
      width: fp.avatarSize,
      height: fp.avatarSize,
      borderRadius: fp.avatarRadius,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: fp.pillBorder,
      backgroundColor: fig.card
    },
    avatarPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: fig.card
    },
    avatarLetter: {
      fontSize: 36,
      fontWeight: "700",
      color: fig.avatarInitialInk
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
      borderColor: fig.canvas
    },
    avatarUploading: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: fp.avatarRadius,
      backgroundColor: fig.gradientBottom,
      alignItems: "center",
      justifyContent: "center"
    },
    avatarUploadingText: {
      fontWeight: "700",
      color: fig.text,
      fontSize: 18
    },
    profileGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: fp.gridGap,
      paddingHorizontal: fp.gridPadH,
      paddingTop: 4,
      backgroundColor: "transparent"
    },
    tile: {
      overflow: "hidden",
      borderRadius: fp.gridTileRadius,
      backgroundColor: fp.gridTileBg
    },
    tileImage: {
      width: "100%",
      height: "100%"
    },
    tileFallback: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: fp.gridTileBg,
      paddingHorizontal: 6
    },
    tileFallbackVideo: {
      backgroundColor: fp.gridTileBg
    },
    tileFallbackText: {
      color: fig.textMuted,
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
      borderColor: fig.glassBorder
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
      color: fig.text,
      letterSpacing: -0.1,
      lineHeight: 16
    },
    productTilePrice: {
      fontSize: 12,
      fontWeight: "600",
      color: fig.accentGold,
      marginTop: 8,
      letterSpacing: -0.05
    },
    productTileStatus: {
      fontSize: 10,
      fontWeight: "600",
      color: fig.textMuted,
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
      color: fig.text
    },
    emptyGridSub: {
      fontSize: 14,
      color: fig.textMuted,
      textAlign: "center"
    },
    walletCard: {
      marginHorizontal: fp.heroPadH,
      marginTop: 14,
      paddingTop: 14,
      paddingBottom: 14,
      paddingHorizontal: fp.infoPanelPadH,
      borderRadius: fp.infoPanelRadius,
      backgroundColor: fp.infoPanelBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: fp.infoPanelBorder,
      gap: 10
    },
    walletCardCompact: {
      marginTop: 12,
      paddingTop: 12,
      paddingBottom: 12
    },
    walletHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8
    },
    walletSectionTitle: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: fp.statLabelColor
    },
    walletMainPress: {
      gap: 4
    },
    walletBalanceRow: {
      flexDirection: "row",
      alignItems: "baseline",
      flexWrap: "wrap",
      gap: 6
    },
    walletBalance: {
      fontSize: 28,
      fontWeight: "700",
      color: fig.text,
      letterSpacing: -0.45,
      fontVariant: ["tabular-nums"]
    },
    walletCurrency: {
      fontSize: 15,
      fontWeight: "600",
      color: fig.textMuted
    },
    walletHint: {
      fontSize: 13,
      fontWeight: "500",
      color: fig.textMuted,
      letterSpacing: -0.1
    },
    walletMeta: {
      fontSize: 12,
      fontWeight: "500",
      color: fp.statLabelColor,
      marginTop: 2
    },
    walletReferralsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: fp.statsRowBorder
    },
    walletReferralsText: {
      fontSize: 14,
      fontWeight: "600",
      color: fig.accentGold,
      letterSpacing: -0.2
    },
    walletMuted: {
      fontSize: 13,
      fontWeight: "500",
      color: fig.textMuted,
      lineHeight: 18
    },
    walletError: {
      fontSize: 13,
      fontWeight: "500",
      color: fig.textMuted
    },
    walletLoader: {
      paddingVertical: 8,
      alignItems: "flex-start"
    }
  });
}

export function ProfileScreen({ navigation }: Props) {
  const { figma, profile: fp, mode } = useAppChrome();
  const styles = useMemo(() => buildProfileStyles(figma, fp), [figma, fp]);
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
  const walletQuery = useRewardsWalletMeQuery(Boolean(sessionQuery.data?.id));
  const points = usePoints();
  const localWallet = points.state?.wallet ?? null;
  const walletBalanceRaw = walletQuery.data?.balancePoints ?? (localWallet ? String(localWallet.totalPoints) : null);
  const walletCurrencyCode = walletQuery.data?.currencyCode ?? "PTS";
  const walletLastRedemptionAt = walletQuery.data?.lastCatalogCheckoutRedemptionAt ?? null;
  const walletShowingLocalFallback = !walletQuery.data && Boolean(localWallet);

  const items = postsQuery.data?.items || [];
  const productItems = productsQuery.data?.items || [];
  const hasBusinessListing = (businessesMineQuery.data?.items?.length ?? 0) > 0;
  const avatarUri = resolveMediaUrl(profileQuery.data?.avatar_url);
  const gridPad = fp.gridPadH;
  const gridGap = fp.gridGap;
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

  const uploadAvatarAsset = useCallback(
    async (file: DocumentPickerAsset) => {
      if (!profileQuery.data) return;
      if (!assetLooksLikeImage(file)) {
        Alert.alert("Image required", "Please choose an image from your library or files.");
        return;
      }
      const mimeType = String(file.mimeType || "").toLowerCase().startsWith("image/")
        ? String(file.mimeType)
        : "image/jpeg";
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
            mimeType,
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
      } catch (error) {
        Alert.alert(
          "Upload failed",
          error instanceof ApiError ? error.message : "Could not upload profile photo."
        );
      } finally {
        setAvatarUploading(false);
      }
    },
    [profileQuery.data, queryClient]
  );

  const uploadAvatar = useCallback(() => {
    if (!profileQuery.data || avatarUploading) {
      return;
    }
    pickVisualMedia({ kind: "post" }, (asset) => {
      if (!asset) {
        return;
      }
      void uploadAvatarAsset(asset);
    });
  }, [avatarUploading, profileQuery.data, uploadAvatarAsset]);

  const websiteHref = p?.website_url ? normalizeWebsiteUrl(p.website_url) : null;

  useEffect(() => {
    const userId = sessionQuery.data?.id;
    if (!userId) {
      return;
    }
    let cancelled = false;
    const syncPurchases = async () => {
      try {
        const response = await apiRequest<{
          items: { order_id: number; status: string }[];
        }>("/monetization/purchases/me?limit=200", { auth: true });
        if (cancelled) {
          return;
        }
        await points.syncCompletedOrders(response.items);
      } catch {
        /* ignore points sync failures */
      }
    };
    void syncPurchases();
    return () => {
      cancelled = true;
    };
  }, [points.syncCompletedOrders, sessionQuery.data?.id]);

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={styles.profileOrb} />
      </View>
      <StatusBar style={mode === "light" ? "dark" : "light"} />
      <View style={[styles.topBar, compact && styles.topBarCompact, { paddingTop: insets.top + 6 }]}>
        <Pressable
          style={styles.topBarHit}
          onPress={() => navigation.navigate("CreateFlow", { screen: "CreateHub" })}
          accessibilityRole="button"
          accessibilityLabel="Create post"
        >
          <IconPlus color={figma.text} size={26} />
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
          <IconMenu color={figma.text} size={26} />
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
                <Pressable
                  style={({ pressed }) => [styles.heroPill, pressed && styles.heroPillPressed]}
                  onPress={() => navigation.navigate("Points")}
                >
                  <Text style={styles.heroPillText}>Points</Text>
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

            <View style={[styles.walletCard, compact && styles.walletCardCompact]}>
              <View style={styles.walletHeader}>
                <Text style={styles.walletSectionTitle}>Wallet</Text>
                {walletQuery.isLoading && !walletShowingLocalFallback ? (
                  <View style={styles.walletLoader}>
                    <ActivityIndicator color={figma.accentGold} size="small" />
                  </View>
                ) : null}
              </View>
              {walletQuery.error instanceof ApiError && walletQuery.error.status === 404 && !walletShowingLocalFallback ? (
                <Text style={styles.walletMuted}>Rewards wallet is not available on this server yet.</Text>
              ) : null}
              {walletShowingLocalFallback ? (
                <Text style={styles.walletMuted}>Showing latest points from this device while wallet sync completes.</Text>
              ) : null}
              {walletQuery.isError &&
              !(walletQuery.error instanceof ApiError && walletQuery.error.status === 404) &&
              !walletShowingLocalFallback ? (
                <Text style={styles.walletError}>
                  {(walletQuery.error as Error)?.message || "Could not load wallet."}
                </Text>
              ) : null}
              {walletBalanceRaw ? (
                <>
                  <Pressable
                    onPress={() => navigation.navigate("RewardsWallet")}
                    style={({ pressed }) => [styles.walletMainPress, pressed && styles.heroPillPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Open rewards wallet"
                  >
                    <View style={styles.walletBalanceRow}>
                      <Text style={styles.walletBalance}>{formatWalletPointsDisplay(walletBalanceRaw)}</Text>
                      <Text style={styles.walletCurrency}>{walletCurrencyCode}</Text>
                    </View>
                    <Text style={styles.walletHint}>
                      {walletShowingLocalFallback
                        ? "Points balance · local activity synced on this device"
                        : "Points balance · tap for history and redemptions"}
                    </Text>
                    {walletLastRedemptionAt ? (
                      <Text style={styles.walletMeta}>
                        Last redemption {formatWalletWhen(walletLastRedemptionAt)}
                      </Text>
                    ) : walletShowingLocalFallback && localWallet ? (
                      <Text style={styles.walletMeta}>
                        Local balance updated {formatWalletWhen(localWallet.lastUpdated)}
                      </Text>
                    ) : (
                      <Text style={styles.walletMeta}>No catalog redemptions yet.</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => navigation.navigate("Referrals")}
                    style={({ pressed }) => [styles.walletReferralsRow, pressed && styles.heroPillPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Open referrals"
                  >
                    <Text style={styles.walletReferralsText}>Referrals</Text>
                    <Text style={[styles.walletReferralsText, { opacity: 0.85 }]}>→</Text>
                  </Pressable>
                </>
              ) : null}
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
                color={activeTab === "posts" ? figma.accentGold : fp.statLabelColor}
                size={fp.contentTabIcon}
              />
              <Text style={[styles.profileTabLabel, activeTab === "posts" ? styles.profileTabLabelActive : null]}>Posts</Text>
            </View>
          </Pressable>
          {canCreateProducts ? (
            <Pressable style={styles.profileTabHit} onPress={() => setActiveTab("products")}>
              <View style={styles.profileTabInner}>
                <IconShoppingBag
                  color={activeTab === "products" ? figma.accentGold : fp.statLabelColor}
                  size={fp.contentTabIcon}
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
                <IconImages color={figma.textMuted} size={48} />
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
                        <IconPlaySmall color={figma.text} size={10} />
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
                <IconShoppingBag color={figma.textMuted} size={48} />
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
