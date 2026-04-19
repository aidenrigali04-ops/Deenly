import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts } from "../../theme";
import { useCreateFlowTheme } from "../ui";

type Props = {
  title: string;
  onBack: () => void;
  draftLabel?: string;
  onDraft?: () => void;
};

export function CreateAppBar({ title, onBack, draftLabel, onDraft }: Props) {
  const insets = useSafeAreaInsets();
  const t = useCreateFlowTheme();

  return (
    <View style={{ paddingTop: insets.top + 8, backgroundColor: t.f.canvas }}>
      <View
        style={{
          minHeight: 52,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          gap: 8
        }}
      >
        <Pressable
          onPress={onBack}
          hitSlop={14}
          style={({ pressed }) => [{ width: 44, opacity: pressed ? 0.65 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.f.text} />
        </Pressable>
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            fontFamily: fonts.semiBold,
            fontSize: 17,
            fontWeight: "600" as const,
            color: t.f.text,
            letterSpacing: -0.35
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {draftLabel && onDraft ? (
          <Pressable
            onPress={onDraft}
            hitSlop={10}
            style={({ pressed }) => [{ minWidth: 44, alignItems: "flex-end", opacity: pressed ? 0.65 : 1 }]}
          >
            <Text style={{ fontSize: 14, fontWeight: "600" as const, color: t.f.accentGold }}>{draftLabel}</Text>
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>
    </View>
  );
}
