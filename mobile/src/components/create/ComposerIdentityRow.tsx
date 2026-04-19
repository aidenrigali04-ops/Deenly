import { Image, Text, View } from "react-native";
import { useCreateFlowTheme } from "../ui";

type Props = {
  avatarUri?: string | null;
  displayName: string;
};

export function ComposerIdentityRow({ avatarUri, displayName }: Props) {
  const t = useCreateFlowTheme();
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <View style={t.composerIdentityRow}>
      {avatarUri ? (
        <Image source={{ uri: avatarUri }} style={t.composerAvatar} resizeMode="cover" />
      ) : (
        <View style={t.composerAvatarFallback}>
          <Text style={t.composerAvatarLetter}>{initial}</Text>
        </View>
      )}
      <Text style={t.composerDisplayName} numberOfLines={1}>
        {displayName}
      </Text>
    </View>
  );
}
