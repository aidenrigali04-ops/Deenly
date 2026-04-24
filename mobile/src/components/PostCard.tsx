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
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { AppVideoView } from "./AppVideoView";
import { LikeBurst } from "./LikeBurst";
import { colors, primaryButtonOutline, radii, resolveFigmaMobile, resolveFigmaMobileHome } from "../theme";
import { useAppChrome } from "../lib/use-app-chrome";
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

/** Figma home card secondary line — “45 minutes ago” under 7d, then short date */
export function formatHomeRelativeTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return formatFeedTimestamp(iso);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
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

/** Figma-style compact counts (e.g. 1.2K, 12M) */
export function formatEngagementCount(n: number): string {
  const abs = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    const s = v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
    return `${s}M`;
  }
  if (abs >= 1000) {
    const v = abs / 1000;
    const s = v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
    return `${s}K`;
  }
  return String(abs);
}

function PostCardComponent({
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
  onOpenPost,
  onPostMenu
}: {
  item: FeedItem;
  onLike?: (nextLiked: boolean, trigger?: "button" | "double_tap") => void;
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
  /** Ellipsis — follow / share live in parent (e.g. Alert) */
  onPostMenu?: () => void;
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
  const lastMediaTapAtRef = useRef(0);
  const isFollowing = Boolean(item.is_following_author);
  useEffect(() => {
    setLiked(Boolean(item.liked_by_viewer));
    setBenefitedCount(Number(item.benefited_count || 0));
    lastMediaTapAtRef.current = 0;
  }, [item.liked_by_viewer, item.benefited_count]);

  const applyLike = (nextLiked: boolean, trigger: "button" | "double_tap") => {
    setLiked(nextLiked);
    setBenefitedCount((value) => Math.max(0, value + (nextLiked ? 1 : -1)));
    onLike?.(nextLiked, trigger);
  };

  const [burstVisible, setBurstVisible] = useState(false);

  const triggerBurst = () => {
    setBurstVisible(false);
    requestAnimationFrame(() => setBurstVisible(true));
  };

  const onMediaTap = () => {
    const now = Date.now();
    const delta = now - lastMediaTapAtRef.current;
    lastMediaTapAtRef.current = now;
    if (delta > 0 && delta < 280 && !liked) {
      triggerBurst();
      applyLike(true, "double_tap");
    }
  };

  const { figma: fm, figmaHome: fmh } = useAppChrome();
  const styles = useMemo(() => buildPostCardStyles(fm, fmh), [fm, fmh]);

  if (layout === "home") {
    const timeLine = item.sponsored
      ? [item.sponsored_label || "Sponsored", formatHomeRelativeTime(item.created_at)].filter(Boolean).join(" · ")
      : formatHomeRelativeTime(item.created_at);

    const tags = item.tags?.length ? item.tags.slice(0, 8) : [];

    return (
      <View style={[styles.homeCardShell, compact && styles.homeCardShellCompact]}>
        <View style={styles.homeCardBase} />
        <LinearGradient
          colors={[fm.gradientTop, "transparent"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.homeScrimTop}
          pointerEvents="none"
        />
        <LinearGradient
          colors={["transparent", fm.gradientBottom]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.homeScrimBottom}
          pointerEvents="none"
        />
        <View style={styles.homeCardForeground}>
          <View style={[styles.homeHeader, compact && styles.homeHeaderCompact]}>
            <View style={[styles.homeAuthorRow, styles.homeAuthorPill]}>
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
                  {timeLine}
                </Text>
              </View>
            </View>
            {onPostMenu ? (
              <Pressable
                style={({ pressed }) => [styles.homeMenuBtn, pressed && styles.homeMenuBtnPressed]}
                onPress={onPostMenu}
                accessibilityRole="button"
                accessibilityLabel="Post options"
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={fm.text} />
              </Pressable>
            ) : null}
          </View>

          {canRenderMedia ? (
            <Pressable onPress={onMediaTap}>
              {isImageMedia(item) ? (
                <Image
                  source={{ uri: mediaUri }}
                  style={styles.homeMedia}
                  resizeMode="cover"
                  onError={() => setMediaFailed(true)}
                />
              ) : (
                <AppVideoView
                  uri={mediaUri!}
                  style={styles.homeMedia}
                  contentFit="cover"
                  nativeControls
                  loop={false}
                  play={mediaPlaybackActive}
                  muted={!mediaPlaybackActive}
                  onError={() => setMediaFailed(true)}
                />
              )}
              <LikeBurst visible={burstVisible} />
            </Pressable>
          ) : (
            <View style={styles.homeMediaPlaceholder}>
              <Text style={styles.homeMediaPlaceholderText}>
                {item.media_url ? "Media unavailable right now." : "No media on this post yet."}
              </Text>
            </View>
          )}

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
            <Text style={styles.homeCaption}>{item.content}</Text>
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
            {tags.length > 0 ? (
              <Text style={styles.homeTagsWrap} numberOfLines={4}>
                {tags.map((tag, i) => (
                  <Text key={`${tag}-${i}`} style={styles.homeTagSegment}>
                    #{tag}
                    {i < tags.length - 1 ? " " : ""}
                  </Text>
                ))}
              </Text>
            ) : null}
            {item.attached_product_id ? (
              <View style={styles.productCtaRow}>
                <Pressable
                  style={[styles.homeButtonSecondary, styles.productCtaHalf]}
                  onPress={() => {
                    void hapticTap();
                    onViewOffer?.(item.attached_product_id as number);
                  }}
                >
                  <Text style={styles.homeButtonText}>View offer</Text>
                </Pressable>
                <Pressable
                  style={[styles.homeButtonPrimary, styles.productCtaHalf, buyBusy && styles.buttonDisabled]}
                  onPress={() => {
                    void hapticPrimary();
                    onBuyNow?.(item.attached_product_id as number);
                  }}
                  disabled={buyBusy}
                >
                  <Text style={styles.homeButtonPrimaryText}>
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

          <View style={[styles.homeEngageIcons, compact && styles.homeEngageIconsCompact]}>
            <Pressable
              style={styles.engageIconBtn}
              onPress={() => {
                applyLike(!liked, "button");
              }}
              disabled={liking}
              accessibilityRole="button"
              accessibilityLabel={liked ? "Unlike" : "Like"}
            >
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={fmh.engageIconSize}
                color={liked ? fm.accentGold : fm.text}
              />
              <Text style={[styles.engageCount, liked && styles.engageCountActive]}>
                {formatEngagementCount(benefitedCount)}
              </Text>
            </Pressable>
            <Pressable
              style={styles.engageIconBtn}
              onPress={() => onOpenPost?.()}
              disabled={!onOpenPost}
              accessibilityRole="button"
              accessibilityLabel="Comments"
            >
              <Ionicons name="chatbubble-outline" size={fmh.engageIconSize} color={fm.text} />
              <Text style={[styles.engageCount, !onOpenPost && styles.engageBtnTextDisabled]}>
                {formatEngagementCount(item.comment_count || 0)}
              </Text>
            </Pressable>
            <Pressable
              style={styles.engageIconBtn}
              onPress={() => void hapticTap()}
              accessibilityRole="button"
              accessibilityLabel="Save"
            >
              <Ionicons name="bookmark-outline" size={fmh.engageIconSize} color={fm.text} />
              <Text style={styles.engageCount}>{formatEngagementCount(item.reflect_later_count || 0)}</Text>
            </Pressable>
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
      {canRenderMedia ? (
        <Pressable onPress={onMediaTap}>
          {isImageMedia(item) ? (
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
          )}
          <LikeBurst visible={burstVisible} />
        </Pressable>
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

export const PostCard = memo(PostCardComponent);

function buildPostCardStyles(fm: ReturnType<typeof resolveFigmaMobile>, fmh: ReturnType<typeof resolveFigmaMobileHome>) {
  return StyleSheet.create({
  homeCardShell: {
    borderRadius: fmh.feedCardRadius,
    overflow: "hidden",
    position: "relative"
  },
  homeCardShellCompact: {
    borderRadius: fmh.feedCardRadius
  },
  homeCardBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: fmh.feedCardBg
  },
  homeScrimTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: `${Math.round(fmh.scrimTopHeightRatio * 100)}%`,
    minHeight: 96,
    zIndex: 0
  },
  homeScrimBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: `${Math.round(fmh.scrimBottomHeightRatio * 100)}%`,
    minHeight: 120,
    zIndex: 0
  },
  homeCardForeground: {
    position: "relative",
    zIndex: 1
  },
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 19,
    paddingBottom: 10,
    gap: 10
  },
  homeHeaderCompact: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8
  },
  homeMenuBtn: {
    width: fmh.menuBtnSize,
    height: fmh.menuBtnSize,
    borderRadius: fmh.menuBtnRadius,
    backgroundColor: fm.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: fm.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 8, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 28
      },
      android: { elevation: 4 },
      default: {}
    })
  },
  homeMenuBtnPressed: {
    opacity: 0.88
  },
  homeAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0
  },
  homeAuthorPill: {
    backgroundColor: fm.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: fm.glassBorder,
    borderRadius: fmh.authorPillRadius,
    paddingVertical: fmh.authorPillPadV,
    paddingLeft: fmh.authorPillPadLeft,
    paddingRight: fmh.authorPillPadRight
  },
  homeAvatar: {
    width: fmh.authorAvatarSize,
    height: fmh.authorAvatarSize,
    borderRadius: fmh.authorAvatarSize / 2,
    borderWidth: 0,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  homeAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 999
  },
  homeAvatarText: {
    color: fm.avatarInitialInk,
    fontSize: 15,
    fontWeight: "600"
  },
  homeAuthor: {
    color: fm.text,
    fontSize: fmh.authorNameSize,
    fontWeight: "500",
    lineHeight: fmh.authorNameLineHeight
  },
  homeSubtle: {
    color: fmh.authorTimeColor,
    fontSize: fmh.authorTimeSize,
    fontWeight: "400",
    lineHeight: 16,
    marginTop: 2
  },
  homeMedia: {
    width: "100%",
    aspectRatio: 4 / 5,
    backgroundColor: fm.mediaSurface
  },
  homeMediaPlaceholder: {
    width: "100%",
    aspectRatio: 4 / 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fm.mediaSurface
  },
  homeMediaPlaceholderText: {
    color: fm.textMuted,
    fontSize: 13,
    paddingHorizontal: 16,
    textAlign: "center"
  },
  homeEngageIcons: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 18,
    gap: fmh.engageRowGap
  },
  homeEngageIconsCompact: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 28
  },
  engageIconBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
    paddingVertical: 4
  },
  engageCount: {
    fontSize: fmh.engageCountSize,
    lineHeight: fmh.engageCountLineHeight,
    color: fm.text,
    fontWeight: "500"
  },
  engageCountActive: {
    color: fm.accentGold
  },
  engageBtnTextDisabled: {
    opacity: 0.45
  },
  homeCaptionWrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 6
  },
  homeCaptionWrapCompact: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 4
  },
  homeTagsWrap: {
    fontSize: 13,
    lineHeight: 19,
    flexWrap: "wrap"
  },
  homeTagSegment: {
    color: fm.accentGold,
    fontWeight: "600"
  },
  homeMetaText: {
    color: fm.textMuted,
    fontSize: 12
  },
  homeMetaTextCompact: {
    fontSize: 11
  },
  monetizationChip: {
    borderColor: fm.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    backgroundColor: fm.glassSoft
  },
  monetizationChipText: {
    color: fm.text,
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
  homeCaption: {
    color: fm.text,
    fontSize: fmh.captionSize,
    fontWeight: "400",
    lineHeight: fmh.captionLineHeight
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
  homeButtonSecondary: {
    borderColor: fm.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: fm.glassSoft
  },
  homeButtonText: {
    color: fm.text,
    fontWeight: "600"
  },
  homeButtonPrimary: {
    borderRadius: radii.button,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: fm.brandTeal,
    alignItems: "center",
    justifyContent: "center"
  },
  homeButtonPrimaryText: {
    color: colors.onAccent,
    fontWeight: "600"
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
}
