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
import { AppVideoView } from "./AppVideoView";
import { colors, primaryButtonOutline, radii, shadows, spacing, type } from "../theme";
import { resolveMediaUrl } from "../lib/media-url";
import type { FeedItem } from "../types";
import { formatMinorCurrency } from "../lib/monetization";
import { hapticPrimary, hapticTap } from "../lib/haptics";

export function formatFeedTimestamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const diff = Date.now() - d.getTime();
  if (diff >= 0 && diff < 86_400_000) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function isImageMedia(item: FeedItem) {
  if (item.media_mime_type?.startsWith("image/")) {
    return true;
  }
  if (!item.media_url) {
    return false;
  }
  return /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(item.media_url);
}

export function PostCard({
  item,
  onLike,
  onViewOffer,
  onBuyNow,
  buyBusy = false,
  buyHandoffProductId,
  liking = false,
  layout = "default",
  onToggleFollow,
  followBusy = false,
  /** When false, video is paused and muted (e.g. off-screen in feed). Default true. */
  mediaPlaybackActive = true,
  onOpenPost
}: {
  item: FeedItem;
  onLike?: () => void;
  onViewOffer?: (productId: number) => void;
  onBuyNow?: (productId: number) => void;
  buyBusy?: boolean;
  buyHandoffProductId?: number | null;
  liking?: boolean;
  layout?: "default" | "home";
  onToggleFollow?: (authorId: number, currentlyFollowing: boolean) => void;
  followBusy?: boolean;
  mediaPlaybackActive?: boolean;
  /** Open full post (e.g. comments) */
  onOpenPost?: () => void;
}) {
  const { height: viewportHeight } = useWindowDimensions();
  const compact = viewportHeight <= 700;
  const [mediaFailed, setMediaFailed] = useState(false);
  useEffect(() => {
    setMediaFailed(false);
  }, [item.id, item.media_url]);
  const mediaUri = resolveMediaUrl(item.media_url) || undefined;
  const canRenderMedia = Boolean(mediaUri) && !mediaFailed;
  const initials = item.author_display_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const authorAvatarUri = resolveMediaUrl(item.author_avatar_url) || undefined;
  const [liked, setLiked] = useState(Boolean(item.liked_by_viewer));
  const [benefitedCount, setBenefitedCount] = useState(Number(item.benefited_count || 0));
  const isFollowing = Boolean(item.is_following_author);
  useEffect(() => {
    setLiked(Boolean(item.liked_by_viewer));
    setBenefitedCount(Number(item.benefited_count || 0));
  }, [item.liked_by_viewer, item.benefited_count]);

  if (layout === "home") {
    const typeLabel =
      item.post_type === "marketplace" ? "Marketplace" : item.post_type === "reel" ? "Reel" : "Post";
    const metaLine = [
      item.sponsored ? item.sponsored_label || "Sponsored" : null,
      typeLabel,
      formatFeedTimestamp(item.created_at)
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <View style={[styles.homeCard, compact && styles.homeCardCompact]}>
        <View style={[styles.homeHeader, compact && styles.homeHeaderCompact]}>
          <View style={styles.homeAuthorRow}>
            <View style={styles.homeAvatar}>
              {authorAvatarUri ? (
                <Image source={{ uri: authorAvatarUri }} style={styles.homeAvatarImage} resizeMode="cover" />
              ) : (
                <Text style={styles.homeAvatarText}>{initials || "U"}</Text>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.homeAuthor} numberOfLines={1}>
                {item.author_display_name}
              </Text>
              <Text style={styles.homeSubtle} numberOfLines={1}>
                {metaLine}
              </Text>
            </View>
          </View>
          {onToggleFollow ? (
            <Pressable
              style={[styles.followPill, compact && styles.followPillCompact]}
              onPress={() => onToggleFollow(item.author_id, isFollowing)}
              disabled={followBusy}
            >
              <Text style={[styles.followPillText, compact && styles.followPillTextCompact]}>
                {followBusy ? "…" : isFollowing ? "Following" : "Follow"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {canRenderMedia ? (
          isImageMedia(item) ? (
            <Image
              source={{ uri: mediaUri }}
              style={styles.homeMedia}
              resizeMode="contain"
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <AppVideoView
              uri={mediaUri!}
              style={styles.homeMedia}
              contentFit="contain"
              nativeControls
              loop={false}
              play={mediaPlaybackActive}
              muted={!mediaPlaybackActive}
              onError={() => setMediaFailed(true)}
            />
          )
        ) : (
          <View style={styles.homeMediaPlaceholder}>
            <Text style={styles.muted}>
              {item.media_url ? "Media unavailable right now." : "No media on this post yet."}
            </Text>
          </View>
        )}

        <View style={[styles.homeEngageRow, compact && styles.homeEngageRowCompact]}>
          <Pressable
            style={styles.engageBtn}
            onPress={() => {
              const next = !liked;
              setLiked(next);
              setBenefitedCount((value) => Math.max(0, value + (next ? 1 : -1)));
              onLike?.();
            }}
            disabled={liking}
          >
            <Text style={[styles.engageBtnText, liked && styles.engageBtnTextActive]}>
              {liked ? "Helpful" : "Mark helpful"}
            </Text>
          </Pressable>
          <Pressable style={styles.engageBtn} onPress={() => onOpenPost?.()} disabled={!onOpenPost}>
            <Text style={[styles.engageBtnText, !onOpenPost && styles.engageBtnTextDisabled]}>
              {item.comment_count || 0} comments
            </Text>
          </Pressable>
          <Pressable
            style={styles.engageBtn}
            onPress={() => {
              void Share.share({
                message: `${item.author_display_name} on Deenly\n${(item.content || "").slice(0, 280)}`
              });
            }}
          >
            <Text style={styles.engageBtnText}>Share</Text>
          </Pressable>
          <Pressable style={styles.engageBtn} onPress={() => void hapticTap()}>
            <Text style={styles.engageBtnText}>Save</Text>
          </Pressable>
        </View>
        <View style={styles.homeHelpfulMeta}>
          <Text style={styles.homeHelpfulMetaText}>
            {benefitedCount} marked helpful
          </Text>
        </View>

        <View style={[styles.homeCaptionWrap, compact && styles.homeCaptionWrapCompact]}>
          {item.attached_product_id ? (
            <View style={styles.monetizationChip}>
              <Text style={styles.monetizationChipText}>
                {item.attached_product_title || "Creator product"} ·{" "}
                {formatMinorCurrency(
                  Number(item.attached_product_price_minor || 0),
                  item.attached_product_currency || "usd"
                )}
              </Text>
            </View>
          ) : null}
          <Text style={styles.content}>
            <Text style={styles.captionAuthor}>{item.author_display_name} </Text>
            {item.content}
          </Text>
          {item.audience_target ? (
            <Text style={[styles.homeMetaText, compact && styles.homeMetaTextCompact]}>
              {item.audience_target === "b2b"
                ? "B2B"
                : item.audience_target === "b2c"
                  ? "B2C"
                  : "B2B/B2C"}
              {item.business_category ? ` - ${item.business_category.replace(/_/g, " ")}` : ""}
            </Text>
          ) : null}
          {item.tags?.length ? (
            <Text style={[styles.homeMetaText, compact && styles.homeMetaTextCompact]}>#{item.tags.slice(0, 3).join(" #")}</Text>
          ) : null}
          {item.attached_product_id ? (
            <View style={styles.productCtaRow}>
              <Pressable
                style={[styles.buttonSecondary, styles.productCtaHalf]}
                onPress={() => {
                  void hapticTap();
                  onViewOffer?.(item.attached_product_id as number);
                }}
              >
                <Text style={styles.buttonText}>View offer</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonPrimary, styles.productCtaHalf, buyBusy && styles.buttonDisabled]}
                onPress={() => {
                  void hapticPrimary();
                  onBuyNow?.(item.attached_product_id as number);
                }}
                disabled={buyBusy}
              >
                <Text style={styles.buttonPrimaryText}>
                  {buyHandoffProductId === item.attached_product_id
                    ? "Securely opening..."
                    : buyBusy
                      ? "Opening..."
                      : "Buy now"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.author}>{item.author_display_name}</Text>
        <Text style={styles.muted}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
      <Text style={styles.type}>{item.post_type}</Text>
      {canRenderMedia ? (
        isImageMedia(item) ? (
          <Image
            source={{ uri: mediaUri }}
            style={styles.video}
            resizeMode="contain"
            onError={() => setMediaFailed(true)}
          />
        ) : (
          <AppVideoView
            uri={mediaUri!}
            style={styles.video}
            contentFit="contain"
            nativeControls
            loop={false}
            play={mediaPlaybackActive}
            muted={!mediaPlaybackActive}
            onError={() => setMediaFailed(true)}
          />
        )
      ) : item.media_url ? (
        <Text style={styles.muted}>Media unavailable right now.</Text>
      ) : null}
      <View style={styles.metricsRow}>
        <Text style={styles.muted}>Likes: {benefitedCount}</Text>
        <Text style={styles.muted}>Comments: {item.comment_count || 0}</Text>
      </View>
      {item.tags?.length ? (
        <Text style={styles.muted}>#{item.tags.slice(0, 3).join(" #")}</Text>
      ) : null}
      <Text style={styles.content}>{item.content}</Text>
      {item.attached_product_id ? (
        <View style={styles.productCtaRow}>
          <Pressable
            style={[styles.buttonSecondary, styles.productCtaHalf]}
            onPress={() => {
              void hapticTap();
              onViewOffer?.(item.attached_product_id as number);
            }}
          >
            <Text style={styles.buttonText}>View offer</Text>
          </Pressable>
          <Pressable
            style={[styles.buttonPrimary, styles.productCtaHalf, buyBusy && styles.buttonDisabled]}
            onPress={() => {
              void hapticPrimary();
              onBuyNow?.(item.attached_product_id as number);
            }}
            disabled={buyBusy}
          >
            <Text style={styles.buttonPrimaryText}>
              {buyHandoffProductId === item.attached_product_id
                ? "Securely opening..."
                : buyBusy
                  ? "Opening..."
                  : "Buy now"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {item.attached_product_id ? (
        <View style={styles.monetizationChip}>
          <Text style={styles.monetizationChipText}>
            {item.attached_product_title || "Creator product"} -{" "}
            {formatMinorCurrency(
              Number(item.attached_product_price_minor || 0),
              item.attached_product_currency || "usd"
            )}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  homeCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    overflow: "hidden",
    ...shadows.card
  },
  homeCardCompact: {
    borderRadius: radii.card
  },
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.cardPadding - 4,
    paddingVertical: 12
  },
  homeHeaderCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  followPill: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minHeight: 34,
    justifyContent: "center",
    backgroundColor: colors.surface
  },
  followPillCompact: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 32
  },
  followPillText: {
    color: colors.text,
    fontSize: type.meta.fontSize,
    fontWeight: "600"
  },
  followPillTextCompact: {
    fontSize: 12
  },
  homeAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0
  },
  homeAvatar: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  homeAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 999
  },
  homeAvatarText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600"
  },
  homeAuthor: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600"
  },
  homeSubtle: {
    color: colors.mutedLight,
    fontSize: 13,
    marginTop: 2
  },
  homeMedia: {
    width: "100%",
    aspectRatio: 4 / 5,
    backgroundColor: colors.background
  },
  homeMediaPlaceholder: {
    width: "100%",
    aspectRatio: 4 / 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background
  },
  homeEngageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.cardPadding - 4,
    paddingTop: 10,
    paddingBottom: 4
  },
  homeEngageRowCompact: {
    paddingHorizontal: 12,
    paddingTop: 8
  },
  engageBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8
  },
  engageBtnText: {
    ...type.meta,
    color: colors.text,
    fontWeight: "600"
  },
  engageBtnTextActive: {
    color: colors.accent
  },
  engageBtnTextDisabled: {
    opacity: 0.45
  },
  homeHelpfulMeta: {
    paddingHorizontal: spacing.cardPadding - 4,
    paddingBottom: 4
  },
  homeHelpfulMetaText: {
    fontSize: 12,
    color: colors.mutedLight
  },
  homeCaptionWrap: {
    paddingHorizontal: spacing.cardPadding - 4,
    paddingTop: 10,
    paddingBottom: spacing.cardPadding,
    gap: 6
  },
  homeCaptionWrapCompact: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 4
  },
  captionAuthor: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600"
  },
  homeMetaText: {
    color: colors.muted,
    fontSize: 12
  },
  homeMetaTextCompact: {
    fontSize: 11
  },
  monetizationChip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    backgroundColor: colors.surface
  },
  monetizationChipText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "600"
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.panel,
    padding: 16,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 16
      },
      android: { elevation: 2 }
    })
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  author: {
    color: colors.text,
    fontWeight: "700"
  },
  type: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  content: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  video: {
    width: "100%",
    height: 200,
    borderRadius: radii.control,
    backgroundColor: "#f3f4f6"
  },
  metricsRow: {
    flexDirection: "row",
    gap: 14
  },
  muted: {
    color: colors.muted,
    fontSize: 12
  },
  actions: {
    flexDirection: "row",
    gap: 8
  },
  productCtaRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4
  },
  productCtaHalf: {
    flex: 1,
    alignItems: "center"
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface
  },
  buttonPrimary: {
    borderRadius: radii.button,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...primaryButtonOutline
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  },
  buttonPrimaryText: {
    color: colors.onAccent,
    fontWeight: "600"
  },
  buttonDisabled: {
    opacity: 0.6
  }
});
