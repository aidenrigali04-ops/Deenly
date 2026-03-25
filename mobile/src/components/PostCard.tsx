import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { ResizeMode, Video } from "expo-av";
import { useEffect, useState } from "react";
import { colors } from "../theme";
import { resolveMediaUrl } from "../lib/media-url";
import type { FeedItem } from "../types";

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
  liking = false,
  layout = "default"
}: {
  item: FeedItem;
  onOpen: () => void;
  onAuthor: () => void;
  onLike?: () => void;
  liking?: boolean;
  layout?: "default" | "home";
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
                {item.post_type === "recitation" ? "Original audio" : "Community post"} -{" "}
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
          <Text style={styles.homeSubtle}>...</Text>
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
            <Video
              source={{ uri: mediaUri }}
              style={styles.homeMedia}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              isLooping={false}
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
            <Text style={styles.homeActionIcon}>♡</Text>
            <Text style={styles.homeActionIcon}>◌</Text>
            <Text style={styles.homeActionIcon}>➤</Text>
          </View>
          <Text style={styles.homeActionIcon}>⌑</Text>
        </View>

        <View style={styles.homeCaptionWrap}>
          <Text style={styles.homeMetaText}>
            {item.benefited_count || 0} benefited - {item.comment_count || 0} comments
          </Text>
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
          <Video
            source={{ uri: mediaUri }}
            style={styles.video}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            isLooping={false}
            onError={() => setMediaFailed(true)}
          />
        )
      ) : item.media_url ? (
        <Text style={styles.muted}>Media unavailable right now.</Text>
      ) : null}
      <View style={styles.metricsRow}>
        <Text style={styles.muted}>Benefited: {item.benefited_count || 0}</Text>
        <Text style={styles.muted}>Comments: {item.comment_count || 0}</Text>
      </View>
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
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden"
  },
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10
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
    fontSize: 13,
    fontWeight: "700"
  },
  homeSubtle: {
    color: colors.muted,
    fontSize: 11
  },
  homeMedia: {
    width: "100%",
    aspectRatio: 4 / 5,
    backgroundColor: colors.surface
  },
  homeMediaPlaceholder: {
    width: "100%",
    aspectRatio: 4 / 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface
  },
  homeActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10
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
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6
  },
  homeMetaText: {
    color: colors.muted,
    fontSize: 12
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8
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
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  content: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  video: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    backgroundColor: colors.surface
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
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  }
});
