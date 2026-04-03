import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

export type NavTabIconKind = "home" | "video" | "marketplace" | "send" | "search" | "upload" | "user";

type Props = {
  kind: NavTabIconKind;
  color: string;
  size?: number;
  focused?: boolean;
};

const SW = 1.8;

export function NavTabIcon({ kind, color, size = 24, focused = false }: Props) {
  const focusAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: focused ? 1 : 0,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [focusAnim, focused]);

  const scale = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08]
  });
  const translateY = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1.5]
  });
  const opacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1]
  });

  const common = { stroke: color, strokeWidth: SW, fill: "none" as const };
  return (
    <Animated.View style={[styles.wrap, { transform: [{ translateY }, { scale }], opacity }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {kind === "home" ? (
          <>
            <Path d="M3 10.8L12 4l9 6.8" {...common} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M5.5 10.5V20h13V10.5" {...common} strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : null}
        {kind === "video" ? (
          <>
            <Rect x="3.5" y="6" width="11.5" height="12" rx="2" {...common} />
            <Path d="M15 10.5l5.5-2v7l-5.5-2z" {...common} strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : null}
        {kind === "marketplace" ? (
          <>
            <Path d="M7.5 9.5V8a4.5 4.5 0 0 1 9 0v1.5" {...common} strokeLinecap="round" />
            <Rect x="5" y="9.5" width="14" height="10" rx="2.8" {...common} />
            <Path d="M9 13h6" {...common} strokeLinecap="round" />
          </>
        ) : null}
        {kind === "send" ? (
          <>
            <Path d="M21 3L10 14" {...common} strokeLinecap="round" />
            <Path d="M21 3l-7 18-4-7-7-4z" {...common} strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : null}
        {kind === "search" ? (
          <>
            <Circle cx="11" cy="11" r="6.5" {...common} />
            <Path d="M20 20l-4-4" {...common} strokeLinecap="round" />
          </>
        ) : null}
        {kind === "upload" ? (
          <>
            <Circle cx="12" cy="12" r="8" {...common} />
            <Path d="M12 8v8" {...common} strokeLinecap="round" />
            <Path d="M8 12h8" {...common} strokeLinecap="round" />
          </>
        ) : null}
        {kind === "user" ? (
          <>
            <Circle cx="12" cy="8" r="3.5" {...common} />
            <Path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...common} strokeLinecap="round" />
          </>
        ) : null}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center"
  }
});
