import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PointAction } from "../domain/models/points-entity";
import { usePointsRewardToastStore } from "../store/points-reward-toast-store";
import { hapticSuccess } from "../../../lib/haptics";
import { radii } from "../../../theme";

type RewardToastItem = {
  id: string;
  points: number;
  action: PointAction;
  totalPoints: number;
  level: number;
  levelUp: boolean;
  streak: number;
  dailyPoints: number;
  celebration: "standard" | "level_up" | "milestone" | "streak";
  milestonePoints?: number;
  createdAt: string;
};

const ACTION_LABEL: Record<PointAction, string> = {
  scroll: "Reel watched",
  like: "Like",
  comment: "Comment",
  purchase: "Purchase",
  follow: "Follow"
};

const SHOW_MS = 1650;
const FADE_MS = 220;
const CONFETTI_COUNT = 10;

function formatPoints(n: number) {
  try {
    return new Intl.NumberFormat("en-US").format(Math.max(0, Math.floor(n)));
  } catch {
    return String(Math.max(0, Math.floor(n)));
  }
}

function celebrationTitle(active: RewardToastItem) {
  if (active.celebration === "level_up") return `Level ${active.level} unlocked!`;
  if (active.celebration === "milestone") return "Milestone reached!";
  if (active.celebration === "streak") return "Streak surge!";
  return "Reward unlocked";
}

function celebrationAccentColor(active: RewardToastItem) {
  if (active.celebration === "level_up") return "#60a5fa";
  if (active.celebration === "milestone") return "#34d399";
  if (active.celebration === "streak") return "#fb7185";
  return "#fcd34d";
}

export function PointsRewardToast() {
  const insets = useSafeAreaInsets();
  const queueLength = usePointsRewardToastStore((s) => s.queue.length);
  const [active, setActive] = useState<RewardToastItem | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-18)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const confettiValues = useRef(
    Array.from({ length: CONFETTI_COUNT }, () => ({
      y: new Animated.Value(0),
      x: new Animated.Value(0),
      opacity: new Animated.Value(0)
    }))
  ).current;

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
    for (const p of confettiValues) {
      p.x.setValue(0);
      p.y.setValue(0);
      p.opacity.setValue(0);
    }
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
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: 12,
        stiffness: 180,
        mass: 0.7,
        useNativeDriver: true
      })
    ]);
    const confettiAnim = Animated.stagger(
      24,
      confettiValues.map((p, idx) =>
        Animated.parallel([
          Animated.timing(p.opacity, {
            toValue: 1,
            duration: 110,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true
          }),
          Animated.timing(p.y, {
            toValue: -18 - (idx % 3) * 6,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true
          }),
          Animated.timing(p.x, {
            toValue: (idx % 2 === 0 ? -1 : 1) * (8 + (idx % 4) * 4),
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true
          }),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration: 180,
            delay: 130,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true
          })
        ])
      )
    );
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
      }),
      Animated.timing(scale, {
        toValue: 0.96,
        duration: FADE_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true
      })
    ]);
    Animated.sequence([inAnim, confettiAnim, Animated.delay(SHOW_MS), outAnim]).start(() => {
      setActive(null);
      opacity.setValue(0);
      translateY.setValue(-18);
      scale.setValue(0.94);
    });
  }, [active, confettiValues, opacity, scale, translateY]);

  const primaryLine = useMemo(() => {
    if (!active) {
      return "";
    }
    const action = ACTION_LABEL[active.action] || "Reward";
    return `+${active.points} points • ${action}`;
  }, [active]);

  const secondaryLine = useMemo(() => {
    if (!active) {
      return "";
    }
    const parts = [`Total ${formatPoints(active.totalPoints)} pts`, `Today +${formatPoints(active.dailyPoints)}`];
    if (active.milestonePoints) {
      parts.unshift(`${formatPoints(active.milestonePoints)} point milestone`);
    }
    if (active.streak >= 2) {
      parts.push(`${active.streak} day streak`);
    }
    if (active.levelUp) {
      parts.push(`Level ${active.level}`);
    }
    return parts.join(" • ");
  }, [active]);

  if (!active) {
    return null;
  }

  const title = celebrationTitle(active);
  const accent = celebrationAccentColor(active);
  const tierGlow = active.celebration === "streak" ? "#fb7185" : "#fcd34d";

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.wrap,
          {
            top: insets.top + 10,
            opacity,
            transform: [{ translateY }, { scale }]
          }
        ]}
      >
        <View style={[styles.toast, { borderColor: `${accent}AA`, shadowColor: tierGlow }]}>
          <View style={[styles.glowBand, { backgroundColor: `${accent}33` }]} />
          <View style={styles.confettiLayer}>
            {confettiValues.map((piece, idx) => (
              <Animated.View
                key={`confetti_${idx}`}
                style={[
                  styles.confettiDot,
                  {
                    backgroundColor: idx % 3 === 0 ? accent : idx % 2 === 0 ? "#fbbf24" : "#ffffff",
                    opacity: piece.opacity,
                    transform: [{ translateX: piece.x }, { translateY: piece.y }]
                  }
                ]}
              />
            ))}
          </View>
          <Text style={[styles.title, { color: accent }]}>{title}</Text>
          <Text style={styles.subtitle}>{primaryLine}</Text>
          <Text style={styles.meta}>{secondaryLine}</Text>
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
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.28)",
    backgroundColor: "rgba(14, 19, 32, 0.92)",
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: "center",
    gap: 2,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 4
  },
  glowBand: {
    ...StyleSheet.absoluteFillObject,
    top: 0,
    bottom: "52%"
  },
  confettiLayer: {
    position: "absolute",
    top: 6,
    left: 12,
    right: 12,
    height: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  confettiDot: {
    width: 5,
    height: 5,
    borderRadius: 2
  },
  title: {
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 0.24,
    textTransform: "uppercase"
  },
  subtitle: {
    color: "#ffffff",
    fontSize: 13.5,
    fontWeight: "600"
  },
  meta: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 11.5,
    fontWeight: "500",
    textAlign: "center"
  }
});
