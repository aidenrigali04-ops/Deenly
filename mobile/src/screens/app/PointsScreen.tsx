import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { usePoints } from "../../features/points";
import {
  POINT_RULE_LIST,
  formatRuleCooldown,
  formatRuleDailyLimit
} from "../../features/points/domain/config/points-action-rules";
import { colors, radii, shadows, spacing } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Points">;

const actionLabel: Record<string, string> = {
  scroll: "Scroll",
  like: "Like",
  comment: "Comment",
  purchase: "Purchase",
  follow: "Follow"
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function PointsScreen({ navigation }: Props) {
  const { state, loading, source } = usePoints();

  const recentTransactions = useMemo(() => state?.transactions.slice(0, 40) ?? [], [state?.transactions]);

  if (loading && !state) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!state) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>Sign in to start earning points.</Text>
      </View>
    );
  }

  const wallet = state.wallet;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={[styles.card, shadows.card]}>
        <Text style={styles.cardLabel}>Total points</Text>
        <Text style={styles.totalPoints}>{wallet.totalPoints.toLocaleString("en-US")}</Text>
        <Text style={styles.meta}>
          Today {wallet.todayPoints.toLocaleString("en-US")} · Level {wallet.level} · Streak {wallet.streak} day
          {wallet.streak === 1 ? "" : "s"}
        </Text>
        <Text style={styles.sourceMeta}>
          Source: {source === "remote" ? "server verified rewards ledger" : "local device cache"}
        </Text>
      </View>

      <View style={[styles.card, shadows.card]}>
        <Text style={styles.sectionTitle}>How points are earned</Text>
        {POINT_RULE_LIST.map((rule) => (
          <View key={rule.action} style={styles.ruleRow}>
            <Text style={styles.ruleMain}>
              {actionLabel[rule.action] ?? rule.action} · +{rule.points}
            </Text>
            <Text style={styles.ruleMeta}>
              Daily limit {formatRuleDailyLimit(rule.dailyLimit)} · Cooldown {formatRuleCooldown(rule.cooldownMs)}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, shadows.card]}>
        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <Pressable onPress={() => navigation.navigate("RewardsWallet")}>
            <Text style={styles.link}>Open rewards wallet →</Text>
          </Pressable>
        </View>
        {recentTransactions.length === 0 ? (
          <Text style={styles.empty}>No points earned yet. Start engaging to build your streak.</Text>
        ) : (
          recentTransactions.map((tx) => (
            <View key={tx.id} style={styles.txRow}>
              <Text style={styles.txMain}>
                +{tx.points} · {actionLabel[tx.action] ?? tx.action}
              </Text>
              <Text style={styles.txMeta}>{formatWhen(tx.createdAt)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 12,
    paddingBottom: spacing.screenBottom,
    gap: 12
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background
  },
  card: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    padding: 16,
    gap: 8
  },
  cardLabel: {
    fontSize: 12,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  totalPoints: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.5
  },
  meta: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  sourceMeta: { fontSize: 12, color: colors.muted },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  ruleRow: {
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 4
  },
  ruleMain: { fontSize: 14, fontWeight: "600", color: colors.text },
  ruleMeta: { fontSize: 12, color: colors.muted },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  link: { fontSize: 13, color: colors.accent, fontWeight: "600" },
  txRow: {
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 2
  },
  txMain: { fontSize: 14, fontWeight: "600", color: colors.text },
  txMeta: { fontSize: 12, color: colors.muted },
  empty: { color: colors.muted, fontSize: 14, lineHeight: 20 }
});
