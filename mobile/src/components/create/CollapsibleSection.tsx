import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCreateFlowTheme } from "../ui";

type Props = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function CollapsibleSection({ title, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const animation = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;
  const t = useCreateFlowTheme();

  useEffect(() => {
    Animated.timing(animation, {
      toValue: open ? 1 : 0,
      duration: 220,
      useNativeDriver: false
    }).start();
  }, [open, animation]);

  const bodyHeight = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 500],
    extrapolate: "clamp"
  });

  const bodyOpacity = animation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.3, 1]
  });

  return (
    <View style={{ overflow: "hidden" }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            minHeight: 48,
            paddingVertical: 6
          },
          pressed && { opacity: 0.72 }
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={t.panelIconMuted} />
        <Text style={t.collapsibleTitle}>{title}</Text>
      </Pressable>
      <Animated.View style={[{ overflow: "hidden" }, { maxHeight: bodyHeight, opacity: bodyOpacity }]}>
        {open ? <View style={{ gap: 12, paddingTop: 4, paddingBottom: 8 }}>{children}</View> : null}
      </Animated.View>
    </View>
  );
}
