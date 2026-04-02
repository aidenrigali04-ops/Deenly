import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { AppVideoView } from "./AppVideoView";
import { colors, radii } from "../theme";
import { resolveMediaUrl } from "../lib/media-url";
import type { FeedItem } from "../types";
import { formatMinorCurrency } from "../lib/monetization";
import { hapticPrimary, hapticTap } from "../lib/haptics";

function isImageMedia(item: FeedItem) {
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
  onOpen,
  onAuthor,
  onLike,
  onViewOffer,
  onBuyNow,
  buyBusy = false,
  buyHandoffProductId,
  liking = false,
  layout = "default",
  onToggleFollow,
  followBusy = false
}: {
  item: FeedItem;
  onOpen: () => void;
  onAuthor: () => void;
  onLike?: () => void;
  onViewOffer?: (productId: number) => void;
  onBuyNow?: (productId: number) => void;
  buyBusy?: boolean;
  buyHandoffProductId?: number | null;
  liking?: boolean;
  layout?: "default" | "home";
  onToggleFollow?: (authorId: number, currentlyFollowing: boolean) => void;
  followBusy?: boolean;
}) {
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
    return (
      <View style={styles.homeCard}>
        <View style={styles.homeHeader}>
          <View style={styles.homeAuthorRow}>
            <View style={styles.homeAvatar}>
              {authorAvatarUri ? (
                <Image source={{ uri: authorAvatarUri }} style={styles.homeAvatarImage} resizeMode="cover" />
              ) : (
                <Text style={styles.homeAvatarText}>{initials || "U"}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.homeAuthor}>{item.author_display_name}</Text>
              <Text style={styles.homeSubtle}>
                {item.sponsored ? `${item.sponsored_label || "Sponsored"} - ` : ""}
                {item.post_type === "marketplace"
                  ? "Marketplace"
                  : item.post_type === "reel"
                    ? "Reel"
                    : "Post"}{" "}
                -{" "}
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
          </View>
          {onToggleFollow ? (
            <Pressable
              style={styles.followPill}
              onPress={() => onToggleFollow(item.author_id, isFollowing)}
              disabled={followBusy}
            >
              <Text style={styles.followPillText}>{followBusy ? "..." : isFollowing ? "Unfollow" : "Follow"}</Text>
            </Pressable>
          ) : (
            <Text style={styles.homeSubtle}>...</Text>
          )}
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

        <View style={styles.homeActionRow}>
          <View style={styles.homeActionIcons}>
            <Pressable
              onPress={() => {
                const next = !liked;
                setLiked(next);
                setBenefitedCount((value) => Math.max(0, value + (next ? 1 : -1)));
                onLike?.();
              }}
              disabled={liking}
            >
              <Text style={styles.homeActionIcon}>{liked ? "♥" : "♡"}</Text>
            </Pressable>
            <Text style={styles.homeActionIcon}>◌</Text>
            <Text style={styles.homeActionIcon}>➤</Text>
          </View>
          <Text style={styles.homeActionIcon}>⌑</Text>
        </View>

        <View style={styles.homeCaptionWrap}>
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
          <Text style={styles.homeMetaText}>
            {benefitedCount} likes · {item.comment_count || 0} comments
          </Text>
          {item.audience_target ? (
            <Text style={styles.homeMetaText}>
              {item.audience_target === "b2b"
                ? "B2B"
                : item.audience_target === "b2c"
                  ? "B2C"
                  : "B2B/B2C"}
              {item.business_category ? ` - ${item.business_category.replace(/_/g, " ")}` : ""}
            </Text>
          ) : null}
          {item.tags?.length ? (
            <Text style={styles.homeMetaText}>#{item.tags.slice(0, 3).join(" #")}</Text>
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
          <Text style={styles.content}>
            <Text style={styles.homeAuthor}>{item.author_display_name} </Text>
            {item.content}
          </Text>
          <View style={styles.actions}>
            <Pressable style={styles.buttonSecondary} onPress={onOpen}>
              <Text style={styles.buttonText}>Open post</Text>
            </Pressable>
            <Pressable style={styles.buttonSecondary} onPress={onAuthor}>
              <Text style={styles.buttonText}>Author</Text>
            </Pressable>
            {onLike ? (
              <Pressable style={styles.buttonSecondary} onPress={onLike} disabled={liking}>
                <Text style={styles.buttonText}>{liking ? "Liking..." : "Like"}</Text>
              </Pressable>
            ) : null}
          </View>
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
      <Text style={styles.content}>{item.content}</Text>
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
      <View style={styles.actions}>
        <Pressable style={styles.buttonSecondary} onPress={onOpen}>
          <Text style={styles.buttonText}>Open post</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={onAuthor}>
          <Text style={styles.buttonText}>Author</Text>
        </Pressable>
        {onLike ? (
          <Pressable style={styles.buttonSecondary} onPress={onLike} disabled={liking}>
            <Text style={styles.buttonText}>{liking ? "Liking..." : "Like"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  homeCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 23,
    overflow: "hidden",
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
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  followPill: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface
  },
  followPillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600"
  },
  homeAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1
  },
  homeAvatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderColor: colors.border,
    borderWidth: 1,
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
    fontSize: 10,
    fontWeight: "700"
  },
  homeAuthor: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  homeSubtle: {
    color: colors.muted,
    fontSize: 11
  },
  homeMedia: {
    width: "100%",
    aspectRatio: 4 / 5,
    backgroundColor: "#f3f4f6"
  },
  homeMediaPlaceholder: {
    width: "100%",
    aspectRatio: 4 / 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6"
  },
  homeActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  homeActionIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  homeActionIcon: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 20
  },
  homeCaptionWrap: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 6
  },
  homeMetaText: {
    color: colors.muted,
    fontSize: 12
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
    borderColor: colors.accent,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.accent
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  },
  buttonPrimaryText: {
    color: colors.onAccent,
    fontWeight: "700"
  },
  buttonDisabled: {
    opacity: 0.6
  }
});
