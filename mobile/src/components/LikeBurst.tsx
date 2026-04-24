import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppChrome } from "../lib/use-app-chrome";

type LikeBurstProps = {
  visible: boolean;
  size?: number;
  onComplete?: () => void;
};

export function LikeBurst({ visible, size = 88, onComplete }: LikeBurstProps) {
  const { figma } = useAppChrome();
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      scale.setValue(0.8);
      return;
    }
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        }),
        Animated.spring(scale, {
          toValue: 1.08,
          friction: 6,
          tension: 120,
          useNativeDriver: true
        })
      ]),
      Animated.timing(scale, {
        toValue: 0.98,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true
      }),
      Animated.delay(120),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(scale, {
          toValue: 1.24,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true
        })
      ])
    ]).start(() => {
      onComplete?.();
    });
  }, [onComplete, opacity, scale, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.absoluteFill}>
      <Animated.View style={[styles.center, { opacity, transform: [{ scale }] }]}>
        <Ionicons name="heart" size={size} color={figma.accentGold} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  center: {
    alignItems: "center",
    justifyContent: "center"
  }
});
