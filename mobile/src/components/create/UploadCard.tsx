import { Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppVideoView } from "../AppVideoView";
import { useCreateFlowTheme } from "../ui";

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
  onRemove
}: Props) {
  const t = useCreateFlowTheme();
  const hasMedia = Boolean(uri);
  const showVideo = hasMedia && (isVideo || mimeType?.startsWith("video/"));

  return (
    <View style={{ gap: 10 }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          t.uploadSurface,
          { minHeight: height },
          error && { borderWidth: 1.5, borderColor: "#FF6B6B" },
          pressed && { opacity: 0.92 }
        ]}
        accessibilityRole="button"
        accessibilityLabel={hasMedia ? "Change media" : title}
      >
        {hasMedia && showVideo ? (
          <AppVideoView key={uri!} uri={uri!} style={[{ width: "100%" }, { height }]} contentFit="cover" loop play muted />
        ) : hasMedia && uri ? (
          <Image source={{ uri }} style={[{ width: "100%" }, { height }]} resizeMode="cover" />
        ) : (
          <View style={{ minHeight: height, alignItems: "center", justifyContent: "center", paddingVertical: 32, paddingHorizontal: 24, gap: 8 }}>
            <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={40} color={t.f.accentGold} />
            <Text style={t.uploadEmptyTitle}>{title}</Text>
            <Text style={t.uploadEmptyHint}>{hint}</Text>
          </View>
        )}
      </Pressable>
      {error ? <Text style={t.errorSmall}>{error}</Text> : null}
      {hasMedia && (onReplace || onRemove) ? (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16 }}>
          {onReplace ? (
            <Pressable onPress={onReplace} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 }, pressed && { opacity: 0.7 }]}>
              <Ionicons name="image-outline" size={18} color={t.f.createFlowInk ?? "#0A0A0B"} />
              <Text style={{ fontSize: 14, fontWeight: "600" as const, color: t.f.createFlowInk ?? "#0A0A0B" }}>Replace</Text>
            </Pressable>
          ) : null}
          {onRemove ? (
            <Pressable onPress={onRemove} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 }, pressed && { opacity: 0.7 }]}>
              <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
              <Text style={{ fontSize: 14, fontWeight: "600" as const, color: "#FF6B6B" }}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
