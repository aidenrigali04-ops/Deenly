import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, figmaMobile, radii } from "../theme";

type Surface = "default" | "dark";

function cardStyle(surface: Surface) {
  return surface === "dark" ? styles.cardDark : styles.card;
}

export function LoadingState({ label = "Loading...", surface = "default" }: { label?: string; surface?: Surface }) {
  return (
    <View style={cardStyle(surface)}>
      <ActivityIndicator color={surface === "dark" ? figmaMobile.accentGold : colors.accent} />
      <Text style={surface === "dark" ? styles.mutedDark : styles.muted}>{label}</Text>
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
  return (
    <View style={cardStyle(surface)}>
      <Text style={styles.error}>{message}</Text>
      {onRetry ? (
        <Pressable
          style={surface === "dark" ? styles.buttonSecondaryDark : styles.buttonSecondary}
          onPress={onRetry}
        >
          <Text style={surface === "dark" ? styles.buttonTextDark : styles.buttonText}>Retry</Text>
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
  return (
    <View style={cardStyle(surface)}>
      <Text style={surface === "dark" ? styles.titleDark : styles.title}>{title}</Text>
      {subtitle ? <Text style={surface === "dark" ? styles.mutedDark : styles.muted}>{subtitle}</Text> : null}
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
  cardDark: {
    backgroundColor: figmaMobile.card,
    borderColor: figmaMobile.glassBorder,
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
    color: figmaMobile.text,
    fontSize: 16,
    fontWeight: "600"
  },
  muted: {
    color: colors.muted,
    fontSize: 14
  },
  mutedDark: {
    color: figmaMobile.textMuted,
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
  buttonSecondaryDark: {
    borderColor: figmaMobile.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start",
    backgroundColor: figmaMobile.glassSoft
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  },
  buttonTextDark: {
    color: figmaMobile.text,
    fontWeight: "600"
  }
});
