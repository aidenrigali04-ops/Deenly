import {
  Image,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { AppVideoView } from "./AppVideoView";
import { formatFeedTimestamp, formatHomeRelativeTime, isImageMedia } from "./PostCard";
import { resolveMediaUrl } from "../lib/media-url";
import type { FeedItem } from "../types";
import { formatMinorCurrency } from "../lib/monetization";
import { hapticTap } from "../lib/haptics";
import { figmaMobile, figmaMobileHome } from "../theme";

/* ── Figma dark market listing (node 1-118) ── */
const PRIMARY = figmaMobile.text;
const MUTED = figmaMobile.textMuted;
const HAIRLINE = figmaMobile.glassBorder;
const CARD_BG = figmaMobileHome.feedCardBg;
const CARD_RADIUS = figmaMobileHome.feedCardRadius;

function listingTitle(item: FeedItem) {
  if (item.attached_product_title?.trim()) {
    return item.attached_product_title.trim();
  }
  const line = item.content?.trim().split("\n")[0]?.trim();
  if (line) {
    return line.length > 120 ? `${line.slice(0, 117)}…` : line;
  }
  return "Listing";
}

function listingSubtitle(item: FeedItem) {
  const title = item.attached_product_title?.trim();
  if (title && item.content?.trim()) {
    const rest = item.content.trim();
    if (rest.startsWith(title)) return rest.slice(title.length).trim() || item.author_display_name;
  }
  return item.author_display_name;
}

function formatListingDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Design placeholder — no listing rating in API yet */
const MOCK_STAR = "4.7";

export function MarketListingCard({
  item,
  viewerUserId,
  onOpenSeller,
  onViewListing,
  onMessageSeller,
  onOpenPost,
  onSave,
  onToggleFollow,
  followBusy = false,
  onLike,
  liking = false,
  mediaPlaybackActive = true
}: {
  item: FeedItem;
  viewerUserId: number | null;
  onOpenSeller: () => void;
  onViewListing: () => void;
  onMessageSeller: () => void;
  onOpenPost?: () => void;
  onSave?: () => void;
  onToggleFollow?: (authorId: number, currentlyFollowing: boolean) => void;
  followBusy?: boolean;
  onLike?: () => void;
  liking?: boolean;
  mediaPlaybackActive?: boolean;
}) {
  const { height: viewportHeight } = useWindowDimensions();
  const compact = viewportHeight <= 700;
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => {
    setMediaFailed(false);
  }, [item.id, item.media_url]);

  const liked = Boolean(item.liked_by_viewer);
  const benefitedCount = Number(item.benefited_count || 0);

  const mediaUri = resolveMediaUrl(item.media_url) || undefined;
  const canRenderMedia = Boolean(mediaUri) && !mediaFailed;
  const initials = item.author_display_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const authorAvatarUri = resolveMediaUrl(item.author_avatar_url) || undefined;
  const isFollowing = Boolean(item.is_following_author);
  const isSelf = viewerUserId != null && item.author_id === viewerUserId;
  const showFollow = Boolean(onToggleFollow && !isSelf);

  const priceStr = item.attached_product_id
    ? formatMinorCurrency(
        Number(item.attached_product_price_minor || 0),
        item.attached_product_currency || "usd"
      )
    : null;
  const priceLine =
    item.attached_product_type === "subscription" && priceStr ? `${priceStr}/mo` : priceStr;

  const title = listingTitle(item);
  const subtitle = listingSubtitle(item);

  const onHeart = () => {
    if (!onLike) return;
    onLike();
  };

  return (
    <View style={styles.card}>
      {/* ── Header row ── */}
      <View style={styles.headerRow}>
        <Pressable style={styles.headerLeft} onPress={onOpenSeller}>
          <View style={styles.avatar}>
            {authorAvatarUri ? (
              <Image source={{ uri: authorAvatarUri }} style={styles.avatarImg} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarLetter}>{initials || "U"}</Text>
            )}
          </View>
          <View style={styles.headerText}>
            <View style={styles.nameRow}>
              <Text style={styles.displayName} numberOfLines={1}>
                {item.author_display_name}
              </Text>
              {item.is_business_post ? (
                <Ionicons name="checkmark-circle" size={16} color="#15999E" style={styles.verified} />
              ) : null}
            </View>
            <Text style={styles.dateLine} numberOfLines={1}>
              {formatHomeRelativeTime(item.created_at) || formatListingDate(item.created_at)}
            </Text>
          </View>
        </Pressable>
        {showFollow ? (
          <Pressable
            style={[styles.followPill, isFollowing && styles.followPillFollowing]}
            onPress={() => onToggleFollow?.(item.author_id, isFollowing)}
            disabled={followBusy}
          >
            <Text style={[styles.followPillText, isFollowing && styles.followPillTextFollowing]}>
              {followBusy ? "…" : isFollowing ? "Following" : "Follow"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Media hero — dual scrim (parity with home PostCard) ── */}
      {canRenderMedia ? (
        <View style={styles.mediaHero}>
          {isImageMedia(item) ? (
            <Image
              source={{ uri: mediaUri }}
              style={styles.mediaFill}
              resizeMode="cover"
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <AppVideoView
              uri={mediaUri!}
              style={styles.mediaFill}
              contentFit="cover"
              nativeControls
              loop={false}
              play={mediaPlaybackActive}
              muted={!mediaPlaybackActive}
              onError={() => setMediaFailed(true)}
            />
          )}
          <LinearGradient
            colors={[figmaMobile.gradientTop, "transparent"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.mediaScrimTop}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["transparent", figmaMobile.gradientBottom]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.mediaScrimBottom}
            pointerEvents="none"
          />
        </View>
      ) : (
        <View style={styles.mediaHero}>
          <LinearGradient
            colors={["#6D28D9", "#1E1B4B", "#0A0A0A"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.mediaPlaceholderFill}
          >
            <Text style={styles.placeholderTitle}>{title}</Text>
            <Text style={styles.placeholderSub}>Tap View offer for details</Text>
          </LinearGradient>
          <LinearGradient
            colors={[figmaMobile.gradientTop, "transparent"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.mediaScrimTop}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["transparent", figmaMobile.gradientBottom]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.mediaScrimBottom}
            pointerEvents="none"
          />
        </View>
      )}

      {/* ── Footer row 1: username + product name | View Offer + price ── */}
      <View style={styles.footerRow1}>
        <View style={styles.footerLeft}>
          <Text numberOfLines={1}>
            <Text style={styles.footerAuthor}>{item.author_display_name}</Text>
            <Text style={styles.footerProductName}>{" "}{title}</Text>
          </Text>
        </View>
        <View style={styles.offerCol}>
          <Pressable
            style={styles.viewOfferBtn}
            onPress={() => {
              void hapticTap();
              onViewListing();
            }}
          >
            <Text style={styles.viewOfferBtnText}>View Offer</Text>
          </Pressable>
          {priceLine ? <Text style={styles.priceUnder}>{priceLine}</Text> : null}
        </View>
      </View>

      {/* ── Footer row 2: engagement bar ── */}
      <View style={styles.engageRow}>
        <View style={styles.engageCluster}>
          <Pressable style={styles.engageItem} onPress={onHeart} disabled={!onLike || liking}>
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={figmaMobileHome.engageIconSize}
              color={liked ? figmaMobile.accentGold : PRIMARY}
            />
            <Text style={styles.engageCount}>{benefitedCount}</Text>
          </Pressable>
          <Pressable style={styles.engageItem} onPress={() => onOpenPost?.()} disabled={!onOpenPost}>
            <Ionicons name="chatbubble-outline" size={figmaMobileHome.engageIconSize} color={PRIMARY} />
            <Text style={styles.engageCount}>{item.comment_count || 0}</Text>
          </Pressable>
          <View style={styles.engageItem}>
            <Ionicons name="star-outline" size={figmaMobileHome.engageIconSize} color={PRIMARY} />
            <Text style={styles.engageCount}>{MOCK_STAR}</Text>
          </View>
        </View>
        <Pressable
          style={styles.bookmarkHit}
          onPress={() => {
            void hapticTap();
            if (onSave) {
              onSave();
              return;
            }
            void Share.share({
              message: `${title} on Deenly\n${item.author_display_name}`
            });
          }}
        >
          <Ionicons name="bookmark-outline" size={figmaMobileHome.engageIconSize} color={PRIMARY} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    marginHorizontal: 0,
    marginBottom: 0
  },

  /* ── Header ── */
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    gap: 10
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: figmaMobile.text,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  avatarImg: {
    width: "100%",
    height: "100%"
  },
  avatarLetter: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a1a"
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  displayName: {
    fontSize: 15,
    fontWeight: "600",
    color: PRIMARY,
    flexShrink: 1
  },
  verified: {
    marginTop: 1
  },
  dateLine: {
    fontSize: 13,
    color: MUTED,
    marginTop: 2,
    fontWeight: "400"
  },
  followPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: figmaMobile.glassBorder,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: figmaMobile.glassSoft
  },
  followPillFollowing: {
    backgroundColor: figmaMobile.glass
  },
  followPillText: {
    fontSize: 15,
    fontWeight: "500",
    color: PRIMARY
  },
  followPillTextFollowing: {
    fontWeight: "500"
  },

  /* ── Media hero + Figma scrims ── */
  mediaHero: {
    width: "100%",
    aspectRatio: 1,
    position: "relative",
    backgroundColor: figmaMobile.mediaSurface,
    overflow: "hidden"
  },
  mediaFill: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  mediaScrimTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: `${Math.round(figmaMobileHome.scrimTopHeightRatio * 100)}%`,
    minHeight: 96
  },
  mediaScrimBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: `${Math.round(figmaMobileHome.scrimBottomHeightRatio * 100)}%`,
    minHeight: 120
  },
  mediaPlaceholderFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8
  },
  placeholderTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center"
  },
  placeholderSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center"
  },

  /* ── Footer row 1 ── */
  footerRow1: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 12,
    gap: 12
  },
  footerLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  footerAuthor: {
    fontSize: 13,
    fontWeight: "600",
    color: PRIMARY
  },
  footerProductName: {
    fontSize: 13,
    fontWeight: "400",
    color: PRIMARY
  },
  offerCol: {
    alignItems: "flex-end",
    gap: 4
  },
  viewOfferBtn: {
    backgroundColor: figmaMobile.brandTeal,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 34,
    alignItems: "center",
    justifyContent: "center"
  },
  viewOfferBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600"
  },
  priceUnder: {
    fontSize: 13,
    fontWeight: "400",
    color: MUTED,
    textAlign: "right"
  },

  /* ── Footer row 2: engagement ── */
  engageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 16
  },
  engageCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: figmaMobileHome.engageRowGap,
    flexShrink: 1
  },
  engageItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  engageCount: {
    fontSize: figmaMobileHome.engageCountSize,
    lineHeight: figmaMobileHome.engageCountLineHeight,
    fontWeight: "500",
    color: PRIMARY
  },
  bookmarkHit: {
    padding: 6,
    marginRight: -4
  }
});
