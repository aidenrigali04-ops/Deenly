import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PointAction } from "../domain/models/points-entity";
import { usePointsRewardToastStore } from "../store/points-reward-toast-store";
import { hapticSuccess } from "../../../lib/haptics";
import { colors, radii } from "../../../theme";

type RewardToastItem = {
  id: string;
  points: number;
  action: PointAction;
  totalPoints: number;
  level: number;
  levelUp: boolean;
  createdAt: string;
};

const ACTION_LABEL: Record<PointAction, string> = {
  scroll: "Reel watched",
  like: "Like",
  comment: "Comment",
  purchase: "Purchase",
  follow: "Follow"
};

const SHOW_MS = 1200;
const FADE_MS = 220;

export function PointsRewardToast() {
  const insets = useSafeAreaInsets();
  const queueLength = usePointsRewardToastStore((s) => s.queue.length);
  const [active, setActive] = useState<RewardToastItem | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-18)).current;

  useEffect(() => {
    if (active || queueLength === 0) {
      return;
    }
    const next = usePointsRewardToastStore.getState().dequeue();
    if (!next) {
      return;
    }
    setActive(next);
  }, [active, queueLength]);

  useEffect(() => {
    if (!active) {
      return;
    }
    void hapticSuccess();
    const inAnim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]);
    const outAnim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(translateY, {
        toValue: -10,
        duration: FADE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true
      })
    ]);
    Animated.sequence([inAnim, Animated.delay(SHOW_MS), outAnim]).start(() => {
      setActive(null);
      opacity.setValue(0);
      translateY.setValue(-18);
    });
  }, [active, opacity, translateY]);

  const label = useMemo(() => {
    if (!active) {
      return "";
    }
    const action = ACTION_LABEL[active.action] || "Reward";
    const levelHint = active.levelUp ? ` • Level ${active.level}` : "";
    return `+${active.points} points • ${action}${levelHint}`;
  }, [active]);

  if (!active) {
    return null;
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.wrap,
          {
            top: insets.top + 10,
            opacity,
            transform: [{ translateY }]
          }
        ]}
      >
        <View style={styles.toast}>
          <Text style={styles.title}>Reward unlocked</Text>
          <Text style={styles.subtitle}>{label}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    alignItems: "center"
  },
  toast: {
    maxWidth: 360,
    minWidth: 240,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.24)",
    backgroundColor: "rgba(14, 19, 32, 0.92)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    gap: 2
  },
  title: {
    color: "#fcd34d",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2
  },
  subtitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600"
  }
});
