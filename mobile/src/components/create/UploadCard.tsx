import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppVideoView } from "../AppVideoView";
import { colors } from "../../theme";

type Props = {
  /** Height of the card */
  height?: number;
  /** Selected file URI */
  uri?: string | null;
  /** Mime type of the selected file */
  mimeType?: string | null;
  /** Whether the file is a video */
  isVideo?: boolean;
  /** Title shown in empty state */
  title?: string;
  /** Hint text shown in empty state */
  hint?: string;
  /** Icon for empty state */
  icon?: string;
  /** Error message */
  error?: string | null;
  /** Called when card is tapped */
  onPress: () => void;
  /** Called when replace is requested (shown when filled) */
  onReplace?: () => void;
  /** Called when remove is requested (shown when filled) */
  onRemove?: () => void;
};

export function UploadCard({
  height = 220,
  uri,
  mimeType,
  isVideo,
  title = "Add photo or video",
  hint = "Tap to select from library, camera, or files",
  icon = "cloud-upload-outline",
  error,
  onPress,
  onReplace,
  onRemove,
}: Props) {
  const hasMedia = Boolean(uri);
  const showVideo = hasMedia && (isVideo || mimeType?.startsWith("video/"));

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { minHeight: height },
          error && styles.cardError,
          pressed && styles.cardPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={hasMedia ? "Change media" : title}
      >
        {hasMedia && showVideo ? (
          <AppVideoView
            key={uri!}
            uri={uri!}
            style={[styles.fill, { height }]}
            contentFit="cover"
            loop
            play
            muted
          />
        ) : hasMedia && uri ? (
          <Image source={{ uri }} style={[styles.fill, { height }]} resizeMode="cover" />
        ) : (
          <View style={[styles.empty, { minHeight: height }]}>
            <Ionicons name={icon as any} size={40} color={colors.accent} />
            <Text style={styles.emptyTitle}>{title}</Text>
            <Text style={styles.emptyHint}>{hint}</Text>
          </View>
        )}
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {hasMedia && (onReplace || onRemove) ? (
        <View style={styles.actions}>
          {onReplace ? (
            <Pressable
              onPress={onReplace}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.cardPressed]}
            >
              <Ionicons name="image-outline" size={18} color={colors.text} />
              <Text style={styles.actionText}>Replace</Text>
            </Pressable>
          ) : null}
          {onRemove ? (
            <Pressable
              onPress={onRemove}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.cardPressed]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={[styles.actionText, { color: colors.danger }]}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const TOKENS = {
  inputFill: "#F5F4F2",
};

const styles = StyleSheet.create({
  wrapper: { gap: 10 },
  card: {
    borderRadius: 16,
    backgroundColor: TOKENS.inputFill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  cardError: {
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  cardPressed: {
    opacity: 0.92,
  },
  fill: {
    width: "100%",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingVertical: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
});
