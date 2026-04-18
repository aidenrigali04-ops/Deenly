import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";
import { useAppChrome } from "../lib/use-app-chrome";

type Surface = "default" | "dark";

export function LoadingState({ label = "Loading...", surface = "default" }: { label?: string; surface?: Surface }) {
  const { figma } = useAppChrome();
  return (
    <View
      style={
        surface === "dark"
          ? [styles.cardDarkShell, { backgroundColor: figma.card, borderColor: figma.glassBorder }]
          : styles.card
      }
    >
      <ActivityIndicator color={surface === "dark" ? figma.accentGold : colors.accent} />
      <Text style={surface === "dark" ? [styles.mutedDark, { color: figma.textMuted }] : styles.muted}>{label}</Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
  surface = "default"
}: {
  message: string;
  onRetry?: () => void;
  surface?: Surface;
}) {
  const { figma } = useAppChrome();
  return (
    <View
      style={
        surface === "dark"
          ? [styles.cardDarkShell, { backgroundColor: figma.card, borderColor: figma.glassBorder }]
          : styles.card
      }
    >
      <Text style={styles.error}>{message}</Text>
      {onRetry ? (
        <Pressable
          style={
            surface === "dark"
              ? [styles.buttonSecondaryDarkShell, { borderColor: figma.glassBorder, backgroundColor: figma.glassSoft }]
              : styles.buttonSecondary
          }
          onPress={onRetry}
        >
          <Text style={surface === "dark" ? [styles.buttonTextDark, { color: figma.text }] : styles.buttonText}>
            Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  subtitle,
  surface = "default"
}: {
  title: string;
  subtitle?: string;
  surface?: Surface;
}) {
  const { figma } = useAppChrome();
  return (
    <View
      style={
        surface === "dark"
          ? [styles.cardDarkShell, { backgroundColor: figma.card, borderColor: figma.glassBorder }]
          : styles.card
      }
    >
      <Text style={surface === "dark" ? [styles.titleDark, { color: figma.text }] : styles.title}>{title}</Text>
      {subtitle ? (
        <Text style={surface === "dark" ? [styles.mutedDark, { color: figma.textMuted }] : styles.muted}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.panel,
    padding: 14,
    gap: 10,
    alignItems: "flex-start"
  },
  cardDarkShell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.feedCard,
    padding: 14,
    gap: 10,
    alignItems: "flex-start"
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600"
  },
  titleDark: {
    fontSize: 16,
    fontWeight: "600"
  },
  muted: {
    color: colors.muted,
    fontSize: 14
  },
  mutedDark: {
    fontSize: 14
  },
  error: {
    color: colors.danger,
    fontSize: 14
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start",
    backgroundColor: colors.surface
  },
  buttonSecondaryDarkShell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start"
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  },
  buttonTextDark: {
    fontWeight: "600"
  }
});
