import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";

type Props = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function CollapsibleSection({ title, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const animation = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animation, {
      toValue: open ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [open, animation]);

  const bodyHeight = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 500],
    extrapolate: "clamp",
  });

  const bodyOpacity = animation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.3, 1],
  });

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.muted}
        />
        <Text style={styles.title}>{title}</Text>
      </Pressable>
      <Animated.View
        style={[
          styles.body,
          { maxHeight: bodyHeight, opacity: bodyOpacity },
        ]}
      >
        {open ? <View style={styles.content}>{children}</View> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingVertical: 6,
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  body: {
    overflow: "hidden",
  },
  content: {
    gap: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
});
