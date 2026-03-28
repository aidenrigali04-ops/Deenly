import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <View style={styles.card}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.error}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.buttonSecondary} onPress={onRetry}>
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
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
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600"
  },
  muted: {
    color: colors.muted,
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
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  }
});
