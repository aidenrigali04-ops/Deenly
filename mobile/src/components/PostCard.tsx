import { Pressable, StyleSheet, Text, View } from "react-native";
import { ResizeMode, Video } from "expo-av";
import { colors } from "../theme";
import type { FeedItem } from "../types";

export function PostCard({
  item,
  onOpen,
  onAuthor
}: {
  item: FeedItem;
  onOpen: () => void;
  onAuthor: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.author}>{item.author_display_name}</Text>
        <Text style={styles.muted}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
      <Text style={styles.type}>{item.post_type}</Text>
      <Text style={styles.content}>{item.content}</Text>
      {item.media_url ? (
        <Video
          source={{ uri: item.media_url }}
          style={styles.video}
          useNativeControls
          resizeMode={ResizeMode.COVER}
          isLooping={false}
        />
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
