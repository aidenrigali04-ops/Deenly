import {
  Image,
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
import { formatFeedTimestamp, isImageMedia } from "./PostCard";
import { resolveMediaUrl } from "../lib/media-url";
import type { FeedItem } from "../types";
import { formatMinorCurrency } from "../lib/monetization";
import { hapticTap } from "../lib/haptics";

const INK = "#0A0A0A";
const CARD_RADIUS = 24;
const BORDER = StyleSheet.hairlineWidth * 2;

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
  const canMessage = Boolean(viewerUserId && !isSelf);
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
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={[styles.headerRow, compact && styles.headerRowCompact]}>
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
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" style={styles.verified} />
              ) : null}
            </View>
            <Text style={styles.dateLine} numberOfLines={1}>
              {formatListingDate(item.created_at) || formatFeedTimestamp(item.created_at)}
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

      {canRenderMedia ? (
        isImageMedia(item) ? (
          <Image
            source={{ uri: mediaUri }}
            style={styles.media}
            resizeMode="cover"
            onError={() => setMediaFailed(true)}
          />
        ) : (
          <AppVideoView
            uri={mediaUri!}
            style={styles.media}
            contentFit="cover"
            nativeControls
            loop={false}
            play={mediaPlaybackActive}
            muted={!mediaPlaybackActive}
            onError={() => setMediaFailed(true)}
          />
        )
      ) : (
        <LinearGradient colors={["#6D28D9", "#1E1B4B", "#0A0A0A"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.mediaPlaceholder}>
          <Text style={styles.placeholderTitle}>{title}</Text>
          <Text style={styles.placeholderSub}>Tap View offer for details</Text>
        </LinearGradient>
      )}

      <View style={[styles.metaBlock, compact && styles.metaBlockCompact]}>
        <View style={styles.titleOfferRow}>
          <Text style={styles.listingHeadline} numberOfLines={2}>
            {subtitle}
          </Text>
          <View style={styles.offerCol}>
            <Pressable
              style={styles.viewOfferBtn}
              onPress={() => {
                void hapticTap();
                onViewListing();
              }}
            >
              <Text style={styles.viewOfferBtnText}>View offer</Text>
            </Pressable>
            {priceLine ? <Text style={styles.priceUnder}>{priceLine}</Text> : null}
          </View>
        </View>
      </View>

      <View style={[styles.engageRow, compact && styles.engageRowCompact]}>
        <Pressable style={styles.engageItem} onPress={onHeart} disabled={!onLike || liking}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={22} color={liked ? "#EF4444" : INK} />
          <Text style={styles.engageCount}>{benefitedCount}</Text>
        </Pressable>
        <Pressable style={styles.engageItem} onPress={() => onOpenPost?.()} disabled={!onOpenPost}>
          <Ionicons name="chatbubble-outline" size={20} color={INK} />
          <Text style={styles.engageCount}>{item.comment_count || 0}</Text>
        </Pressable>
        <View style={styles.engageItem}>
          <Ionicons name="star-outline" size={22} color={INK} />
          <Text style={styles.engageCount}>{MOCK_STAR}</Text>
        </View>
        <View style={styles.engageSpacer} />
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
          <Ionicons name="bookmark-outline" size={24} color={INK} />
        </Pressable>
      </View>

      {canMessage ? (
        <Pressable
          style={styles.messageLink}
          onPress={() => {
            void hapticTap();
            onMessageSeller();
          }}
        >
          <Text style={styles.messageLinkText}>Message seller</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: INK,
    borderWidth: BORDER,
    borderRadius: CARD_RADIUS,
    overflow: "hidden"
  },
  cardCompact: {
    borderRadius: 20
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10
  },
  headerRowCompact: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: BORDER,
    borderColor: INK,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  avatarImg: {
    width: "100%",
    height: "100%"
  },
  avatarLetter: {
    fontSize: 16,
    fontWeight: "700",
    color: INK
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  displayName: {
    fontSize: 16,
    fontWeight: "700",
    color: INK,
    flexShrink: 1
  },
  verified: {
    marginTop: 1
  },
  dateLine: {
    fontSize: 13,
    color: "rgba(10,10,10,0.55)",
    marginTop: 3,
    fontWeight: "500"
  },
  followPill: {
    borderWidth: BORDER,
    borderColor: INK,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF"
  },
  followPillFollowing: {
    backgroundColor: "rgba(10,10,10,0.06)"
  },
  followPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: INK
  },
  followPillTextFollowing: {
    fontWeight: "600"
  },
  media: {
    width: "100%",
    aspectRatio: 4 / 5,
    backgroundColor: "#F0F0F0"
  },
  mediaPlaceholder: {
    width: "100%",
    aspectRatio: 4 / 5,
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
  metaBlock: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6
  },
  metaBlockCompact: {
    paddingHorizontal: 12,
    paddingTop: 12
  },
  titleOfferRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  listingHeadline: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: INK,
    lineHeight: 21
  },
  offerCol: {
    alignItems: "flex-end",
    gap: 6
  },
  viewOfferBtn: {
    backgroundColor: INK,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  viewOfferBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700"
  },
  priceUnder: {
    fontSize: 13,
    fontWeight: "700",
    color: INK
  },
  engageRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(10,10,10,0.12)"
  },
  engageRowCompact: {
    paddingVertical: 8
  },
  engageItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginRight: 16
  },
  engageCount: {
    fontSize: 14,
    fontWeight: "700",
    color: INK
  },
  engageSpacer: {
    flex: 1
  },
  bookmarkHit: {
    padding: 8,
    marginRight: -4
  },
  messageLink: {
    paddingHorizontal: 14,
    paddingBottom: 14
  },
  messageLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#156B75",
    textDecorationLine: "underline"
  }
});
