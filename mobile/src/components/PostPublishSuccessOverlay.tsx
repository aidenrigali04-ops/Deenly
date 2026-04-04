import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { colors, radii, shadows } from "../theme";
import { hapticSuccess } from "../lib/haptics";

export type PostPublishVariant = "post" | "reel" | "marketplace" | "event";

type Props = {
  visible: boolean;
  variant: PostPublishVariant;
  onFinish: () => void;
};

function copyForVariant(v: PostPublishVariant) {
  if (v === "reel") {
    return { title: "Reel published", subtitle: "Your video is live for the community." };
  }
  if (v === "marketplace") {
    return { title: "Listing published", subtitle: "Your offer is on the marketplace." };
  }
  if (v === "event") {
    return { title: "Event created", subtitle: "RSVP and chat are ready for your guests." };
  }
  return { title: "Post published", subtitle: "Thanks for sharing something beneficial." };
}

function hintForVariant(v: PostPublishVariant) {
  return v === "event" ? "Tap anywhere to open your event" : "Tap anywhere to open your post";
}

export function PostPublishSuccessOverlay({ visible, variant, onFinish }: Props) {
  const backdrop = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslate = useRef(new Animated.Value(10)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const { title, subtitle } = copyForVariant(variant);
  const hint = hintForVariant(variant);

  useEffect(() => {
    if (!visible) {
      backdrop.setValue(0);
      cardOpacity.setValue(0);
      cardTranslate.setValue(10);
      checkScale.setValue(0);
      if (finishTimer.current) {
        clearTimeout(finishTimer.current);
        finishTimer.current = null;
      }
      return;
    }

    void hapticSuccess();

    let cancelled = false;
    const done = () => {
      if (!cancelled) onFinishRef.current();
    };

    const run = async () => {
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      if (cancelled) return;

      if (reduceMotion) {
        backdrop.setValue(1);
        cardOpacity.setValue(1);
        cardTranslate.setValue(0);
        checkScale.setValue(1);
        finishTimer.current = setTimeout(done, 550);
        return;
      }

      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.sequence([
          Animated.delay(40),
          Animated.parallel([
            Animated.timing(cardOpacity, {
              toValue: 1,
              duration: 260,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true
            }),
            Animated.spring(cardTranslate, {
              toValue: 0,
              friction: 8,
              tension: 80,
              useNativeDriver: true
            }),
            Animated.spring(checkScale, {
              toValue: 1,
              friction: 6,
              tension: 120,
              useNativeDriver: true
            })
          ])
        ])
      ]).start();

      finishTimer.current = setTimeout(done, 1280);
    };

    void run();

    return () => {
      cancelled = true;
      if (finishTimer.current) {
        clearTimeout(finishTimer.current);
        finishTimer.current = null;
      }
    };
  }, [visible, backdrop, cardOpacity, cardTranslate, checkScale]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Pressable
        style={styles.dismissHit}
        onPress={() => onFinishRef.current()}
        accessibilityRole="button"
        accessibilityLabel={variant === "event" ? "Continue to event" : "Continue to post"}
      >
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Animated.View
            style={[
              styles.card,
              shadows.card,
              {
                opacity: cardOpacity,
                transform: [{ translateY: cardTranslate }]
              }
            ]}
          >
            <Animated.View style={[styles.checkRing, { transform: [{ scale: checkScale }] }]}>
              <View style={styles.checkInner}>
                <Text style={styles.checkMark} accessibilityLabel="Success">
                  ✓
                </Text>
              </View>
            </Animated.View>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardSub}>{subtitle}</Text>
            <Text style={styles.hint}>{hint}</Text>
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dismissHit: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 28
  },
  card: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 28,
    borderRadius: radii.panel,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  checkRing: {
    marginBottom: 20
  },
  checkInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(22, 163, 74, 0.1)",
    borderWidth: 2,
    borderColor: colors.success,
    alignItems: "center",
    justifyContent: "center"
  },
  checkMark: {
    fontSize: 34,
    color: colors.success,
    fontWeight: "700",
    marginTop: -2
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.5,
    textAlign: "center"
  },
  cardSub: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: "center"
  },
  hint: {
    marginTop: 20,
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    opacity: 0.85
  }
});
