import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { radii, resolveFigmaMobile, spacing } from "../../theme";
import { useAppChrome } from "../../lib/use-app-chrome";

const CATEGORIES = ["Popular", "Latest", "Sports", "Traveling", "News"] as const;
const CAROUSEL_VIEWS = ["1.2M Views", "12M Views", "6.8M Views"] as const;

type Props = {
  /** Short line under “Recommended For You” (user-facing, not dev notes). */
  recommendedCaption?: string;
};

function buildDiscoverStyles(fig: ReturnType<typeof resolveFigmaMobile>) {
  return StyleSheet.create({
    block: {
      marginBottom: 4,
      gap: 14
    },
    categoriesContent: {
      paddingHorizontal: spacing.pagePaddingH,
      gap: 18,
      alignItems: "flex-start",
      paddingBottom: 2
    },
    categoryHit: {
      alignItems: "center",
      minWidth: 56
    },
    categoryLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: fig.text,
      letterSpacing: -0.2
    },
    categoryLabelOn: {
      color: fig.accentGold
    },
    categoryRule: {
      marginTop: 6,
      height: 3,
      width: "100%",
      borderRadius: 2,
      backgroundColor: "transparent"
    },
    categoryRuleOn: {
      backgroundColor: fig.accentGold
    },
    carouselContent: {
      paddingHorizontal: spacing.pagePaddingH,
      gap: 12
    },
    carouselCard: {
      width: 112,
      height: 158,
      borderRadius: radii.card + 2,
      overflow: "hidden",
      justifyContent: "flex-end",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: fig.glassBorderSoft
    },
    carouselScrim: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 72
    },
    carouselLabel: {
      position: "absolute",
      left: 10,
      right: 10,
      bottom: 10,
      fontSize: 12,
      fontWeight: "700",
      color: fig.text,
      textShadowColor: fig.gradientTop,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3
    },
    recommendedTitle: {
      paddingHorizontal: spacing.pagePaddingH,
      fontSize: 17,
      fontWeight: "700",
      color: fig.text,
      letterSpacing: -0.35,
      marginTop: 2
    },
    recommendedCaption: {
      paddingHorizontal: spacing.pagePaddingH,
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
      color: fig.textMuted,
      fontWeight: "400",
      letterSpacing: -0.15
    }
  });
}

/**
 * Figma Discover — category strip + hero carousel (placeholders until wired to real data).
 */
export function DiscoverFigmaChrome({
  recommendedCaption = "Trending previews highlight popular formats. Use search and Near me below for live results on Deenly."
}: Props) {
  const [categoryIndex, setCategoryIndex] = useState(0);
  const { figma } = useAppChrome();
  const styles = useMemo(() => buildDiscoverStyles(figma), [figma]);

  return (
    <View style={styles.block}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContent}
      >
        {CATEGORIES.map((label, i) => {
          const on = i === categoryIndex;
          return (
            <Pressable key={label} onPress={() => setCategoryIndex(i)} style={styles.categoryHit}>
              <Text style={[styles.categoryLabel, on && styles.categoryLabelOn]}>{label}</Text>
              <View style={[styles.categoryRule, on && styles.categoryRuleOn]} />
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContent}
      >
        {CAROUSEL_VIEWS.map((label) => (
          <View key={label} style={styles.carouselCard}>
            <LinearGradient
              colors={[figma.mediaSurface, figma.card]}
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              colors={["transparent", figma.gradientBottom]}
              style={styles.carouselScrim}
              pointerEvents="none"
            />
            <Text style={styles.carouselLabel}>{label}</Text>
          </View>
        ))}
      </ScrollView>

      <Text style={styles.recommendedTitle}>Recommended For You</Text>
      <Text style={styles.recommendedCaption}>{recommendedCaption}</Text>
    </View>
  );
}
