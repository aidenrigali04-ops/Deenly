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
import { AppVideoView } from "./AppVideoView";
import { formatFeedTimestamp, isImageMedia } from "./PostCard";
import { colors, radii, shadows, spacing, type } from "../theme";
import { resolveMediaUrl } from "../lib/media-url";
import type { FeedItem } from "../types";
import { formatMinorCurrency } from "../lib/monetization";
import { hapticTap } from "../lib/haptics";

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

function productTypeLabel(t: FeedItem["attached_product_type"]) {
  if (t === "digital") return "Digital";
  if (t === "service") return "Service";
  if (t === "subscription") return "Membership";
  return null;
}

export function MarketListingCard({
  item,
  viewerUserId,
  onOpenSeller,
  onViewListing,
  onMessageSeller,
  onSave,
  mediaPlaybackActive = true
}: {
  item: FeedItem;
  viewerUserId: number | null;
  onOpenSeller: () => void;
  onViewListing: () => void;
  onMessageSeller: () => void;
  onSave?: () => void;
  mediaPlaybackActive?: boolean;
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

  const sellerMeta = [
    item.is_business_post ? "Business" : "Creator",
    formatFeedTimestamp(item.created_at)
  ]
    .filter(Boolean)
    .join(" · ");

  const categoryLabel = item.business_category
    ? item.business_category.replace(/_/g, " ")
    : null;
  const typeLabel = productTypeLabel(item.attached_product_type);
  const canMessage = Boolean(viewerUserId && item.author_id !== viewerUserId);

  const audienceLabel =
    item.audience_target === "b2b"
      ? "B2B"
      : item.audience_target === "b2c"
        ? "B2C"
        : item.audience_target === "both"
          ? "B2B/B2C"
          : null;
  const metaParts = [categoryLabel, typeLabel, audienceLabel].filter(Boolean).join(" · ");

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Pressable style={[styles.sellerRow, compact && styles.sellerRowCompact]} onPress={onOpenSeller}>
        <View style={styles.sellerAvatar}>
          {authorAvatarUri ? (
            <Image source={{ uri: authorAvatarUri }} style={styles.sellerAvatarImg} resizeMode="cover" />
          ) : (
            <Text style={styles.sellerAvatarText}>{initials || "U"}</Text>
          )}
        </View>
        <View style={styles.sellerText}>
          <Text style={styles.sellerName} numberOfLines={1}>
            {item.author_display_name}
          </Text>
          <Text style={styles.sellerMeta} numberOfLines={1}>
            {sellerMeta}
          </Text>
        </View>
      </Pressable>

      {item.is_business_post ? (
        <View style={[styles.trustRow, compact && styles.trustRowCompact]}>
          <View style={styles.trustChip}>
            <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
            <Text style={styles.trustChipText}>Verified business</Text>
          </View>
          <View style={[styles.trustChip, styles.trustChipNeutral]}>
            <Ionicons name="location-outline" size={14} color={colors.muted} />
            <Text style={styles.trustChipTextMuted}>Local</Text>
          </View>
        </View>
      ) : null}

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
        <View style={styles.mediaPlaceholder}>
          <Text style={styles.placeholderText}>
            {item.media_url ? "Media unavailable." : "No image yet."}
          </Text>
        </View>
      )}

      <View style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.titleRow}>
          <Text style={styles.listingTitle} numberOfLines={2}>
            {listingTitle(item)}
          </Text>
          {item.attached_product_id ? (
            <Text style={styles.price}>
              {formatMinorCurrency(
                Number(item.attached_product_price_minor || 0),
                item.attached_product_currency || "usd"
              )}
            </Text>
          ) : null}
        </View>

        {metaParts ? (
          <Text style={styles.metadataLine} numberOfLines={2}>
            {metaParts}
          </Text>
        ) : null}

        {item.content && item.attached_product_title ? (
          <Text style={styles.description} numberOfLines={2}>
            {item.content}
          </Text>
        ) : null}
      </View>

      <View style={[styles.ctaRow, compact && styles.ctaRowCompact]}>
        <Pressable
          style={styles.ctaBtn}
          onPress={() => {
            void hapticTap();
            onViewListing();
          }}
        >
          <Ionicons name="eye-outline" size={20} color={colors.accent} />
          <Text style={styles.ctaLabel}>View</Text>
        </Pressable>
        <Pressable
          style={[styles.ctaBtn, !canMessage && styles.ctaBtnDisabled]}
          onPress={() => {
            void hapticTap();
            onMessageSeller();
          }}
          disabled={!canMessage}
        >
          <Ionicons name="chatbubble-outline" size={19} color={canMessage ? colors.accent : colors.mutedLight} />
          <Text style={[styles.ctaLabel, !canMessage && styles.ctaLabelDisabled]}>Message</Text>
        </Pressable>
        <Pressable
          style={styles.ctaBtn}
          onPress={() => {
            void hapticTap();
            if (onSave) {
              onSave();
              return;
            }
            void Share.share({
              message: `${listingTitle(item)} on Deenly\n${item.author_display_name}`
            });
          }}
        >
          <Ionicons name="bookmark-outline" size={20} color={colors.accent} />
          <Text style={styles.ctaLabel}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    overflow: "hidden",
    ...shadows.card
  },
  cardCompact: {
    borderRadius: radii.card
  },
  sellerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.cardPadding,
    paddingVertical: 12
  },
  sellerRowCompact: {
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  sellerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  sellerAvatarImg: {
    width: "100%",
    height: "100%"
  },
  sellerAvatarText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600"
  },
  sellerText: {
    flex: 1,
    minWidth: 0
  },
  sellerName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600"
  },
  sellerMeta: {
    ...type.meta,
    color: colors.mutedLight,
    marginTop: 2
  },
  trustRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: spacing.cardPadding,
    paddingBottom: 10
  },
  trustRowCompact: {
    paddingHorizontal: 14,
    paddingBottom: 8
  },
  trustChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted
  },
  trustChipNeutral: {
    backgroundColor: colors.subtleFill
  },
  trustChipText: {
    ...type.metaSm,
    color: colors.accent,
    fontWeight: "600"
  },
  trustChipTextMuted: {
    ...type.metaSm,
    color: colors.muted
  },
  media: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: colors.background
  },
  mediaPlaceholder: {
    width: "100%",
    aspectRatio: 4 / 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background
  },
  placeholderText: {
    ...type.meta,
    color: colors.mutedLight
  },
  body: {
    paddingHorizontal: spacing.cardPadding,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 6
  },
  bodyCompact: {
    paddingHorizontal: 14,
    paddingTop: 10
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  listingTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22
  },
  price: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2
  },
  metadataLine: {
    ...type.meta,
    color: colors.muted
  },
  description: {
    ...type.meta,
    color: colors.muted,
    lineHeight: 18
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    paddingHorizontal: spacing.cardPadding - 4,
    paddingTop: 8,
    paddingBottom: spacing.cardPadding
  },
  ctaRowCompact: {
    paddingHorizontal: 10,
    paddingBottom: 14
  },
  ctaBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    minHeight: 44
  },
  ctaBtnDisabled: {
    opacity: 0.45
  },
  ctaLabel: {
    ...type.button,
    fontSize: 14,
    color: colors.accent
  },
  ctaLabelDisabled: {
    color: colors.mutedLight
  }
});
