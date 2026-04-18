import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radii, resolveFigmaMobile } from "../theme";
import { useAppChrome } from "../lib/use-app-chrome";
import type { FeedEventCardItem } from "../types";

function formatEventStart(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

function buildCardStyles(fig: ReturnType<typeof resolveFigmaMobile>) {
  return StyleSheet.create({
    card: {
      borderRadius: radii.feedCardHero,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: fig.glassBorder,
      backgroundColor: fig.card,
      padding: 14,
      gap: 6
    },
    cardCompact: {
      padding: 12,
      gap: 4
    },
    pressed: {
      opacity: 0.92
    },
    badge: {
      alignSelf: "flex-start",
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: fig.textMuted
    },
    title: {
      fontSize: 17,
      fontWeight: "700",
      color: fig.text,
      letterSpacing: -0.2
    },
    meta: {
      fontSize: 13,
      fontWeight: "600",
      color: fig.text
    },
    sub: {
      fontSize: 13,
      color: fig.textMuted,
      lineHeight: 18
    },
    footer: {
      marginTop: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      flexWrap: "wrap"
    },
    cta: {
      fontSize: 14,
      fontWeight: "600",
      color: fig.accentGold
    },
    counts: {
      fontSize: 12,
      color: fig.textMuted
    }
  });
}

export function FeedEventCard({
  item,
  compact,
  onOpen
}: {
  item: FeedEventCardItem;
  compact: boolean;
  onOpen: () => void;
}) {
  const { figma } = useAppChrome();
  const styles = useMemo(() => buildCardStyles(figma), [figma]);
  const ev = item.event;
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        pressed && styles.pressed
      ]}
    >
      {item.sponsored ? (
        <Text style={styles.badge}>{item.sponsored_label || "Sponsored"}</Text>
      ) : null}
      <Text style={styles.title} numberOfLines={2}>
        {ev.title}
      </Text>
      <Text style={styles.meta}>{formatEventStart(ev.starts_at)}</Text>
      {ev.address_display ? (
        <Text style={styles.sub} numberOfLines={2}>
          {ev.address_display}
        </Text>
      ) : ev.is_online ? (
        <Text style={styles.sub}>Online event</Text>
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.cta}>View event →</Text>
        {ev.rsvp_going_count > 0 ? (
          <Text style={styles.counts}>
            {ev.rsvp_going_count} going · {ev.rsvp_interested_count} interested
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
