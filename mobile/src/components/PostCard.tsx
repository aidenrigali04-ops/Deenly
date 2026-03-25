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
  onAuthor
}: {
  item: FeedItem;
  onOpen: () => void;
  onAuthor: () => void;
}) {
  const [mediaFailed, setMediaFailed] = useState(false);
  useEffect(() => {
    setMediaFailed(false);
  }, [item.id, item.media_url]);
  const mediaUri = resolveMediaUrl(item.media_url) || undefined;
  const canRenderMedia = Boolean(mediaUri) && !mediaFailed;

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
            resizeMode="cover"
            onError={() => setMediaFailed(true)}
          />
        ) : (
          <Video
            source={{ uri: mediaUri }}
            style={styles.video}
            useNativeControls
            resizeMode={ResizeMode.COVER}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
