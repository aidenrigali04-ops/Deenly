import { Platform, Pressable, Text, View } from "react-native";
import { useCreateFlowTheme } from "../ui";

export type PostingType = "post" | "product" | "event" | "reel";

type Props = {
  value: PostingType;
  onChange: (type: PostingType) => void;
  options?: PostingType[];
};

const LABELS: Record<PostingType, string> = {
  post: "Post",
  product: "Product",
  event: "Event",
  reel: "Reel"
};

export function PostingTypeSegmentedControl({
  value,
  onChange,
  options = ["post", "product", "event", "reel"]
}: Props) {
  const t = useCreateFlowTheme();

  return (
    <View style={t.postingTrack}>
      {options.map((type) => {
        const active = type === value;
        return (
          <Pressable
            key={type}
            onPress={() => onChange(type)}
            style={[
              t.postingPill,
              active ? t.postingPillActive : t.postingPillIdle,
              active &&
                Platform.select({
                  ios: {
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.2,
                    shadowRadius: 5
                  },
                  android: { elevation: 2 },
                  default: {}
                })
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={active ? t.postingTextActive : t.postingTextIdle}>{LABELS[type]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
