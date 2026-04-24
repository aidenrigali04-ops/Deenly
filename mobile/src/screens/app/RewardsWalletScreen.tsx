import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError } from "../../lib/api";
import { colors, radii, shadows, spacing } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import type { RewardsLedgerEntryDto } from "@deenly/rewards";
import { useRewardsLedgerInfiniteQuery, useRewardsWalletMeQuery } from "../../hooks/use-rewards-wallet";
import { usePoints } from "../../features/points";

type Props = NativeStackScreenProps<RootStackParamList, "RewardsWallet">;

function formatPointsDisplay(raw: string | number): string {
  try {
    return BigInt(String(raw)).toLocaleString("en-US");
  } catch {
    return String(raw);
  }
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function LedgerBlock({ row }: { row: RewardsLedgerEntryDto }) {
  let tone = colors.text;
  try {
    const n = BigInt(row.deltaPoints);
    if (n > 0n) tone = colors.success;
    else if (n < 0n) tone = colors.danger;
  } catch {
    /* ignore */
  }
  const prefix = (() => {
    try {
      return BigInt(row.deltaPoints) > 0n ? "+" : "";
    } catch {
      return "";
    }
  })();
  return (
    <View style={styles.ledgerRow}>
      <Text style={[styles.ledgerDelta, { color: tone }]}>
        {prefix}
        {formatPointsDisplay(row.deltaPoints)}
      </Text>
      <Text style={styles.ledgerMeta}>
        {row.entryKind}
        {row.reason ? ` · ${row.reason}` : ""}
      </Text>
      <Text style={styles.ledgerDate}>{formatWhen(row.createdAt)}</Text>
    </View>
  );
}

export function RewardsWalletScreen({ navigation }: Props) {
  const points = usePoints();
  const walletQuery = useRewardsWalletMeQuery(true);
  const ledgerInfinite = useRewardsLedgerInfiniteQuery(Boolean(walletQuery.data));
  const localWallet = points.state?.wallet ?? null;
  const walletBalanceRaw = walletQuery.data?.balancePoints ?? (localWallet ? String(localWallet.totalPoints) : null);
  const walletCurrencyCode = walletQuery.data?.currencyCode ?? "PTS";
  const walletLastRedemptionAt = walletQuery.data?.lastCatalogCheckoutRedemptionAt ?? null;
  const walletShowingLocalFallback = !walletQuery.data && Boolean(localWallet);

  const ledgerRows = useMemo(
    () => ledgerInfinite.data?.pages.flatMap((p) => [...p.items]) ?? [],
    [ledgerInfinite.data?.pages]
  );
  const localTransactions = useMemo(() => points.state?.transactions.slice(0, 40) ?? [], [points.state?.transactions]);

  if (walletQuery.isLoading && !walletShowingLocalFallback) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (walletQuery.error instanceof ApiError && walletQuery.error.status === 404 && !walletShowingLocalFallback) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.error}>Rewards are not available on this server yet.</Text>
      </ScrollView>
    );
  }

  if (walletQuery.isError && !walletShowingLocalFallback) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.error}>{(walletQuery.error as Error)?.message || "Could not load rewards."}</Text>
      </ScrollView>
    );
  }

  if (!walletBalanceRaw) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.error}>Could not load rewards.</Text>
      </ScrollView>
    );
  }

  const ledger404 = ledgerInfinite.error instanceof ApiError && ledgerInfinite.error.status === 404;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Pressable onPress={() => navigation.navigate("Referrals")}>
        <Text style={styles.jumpLink}>Open referrals →</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate("Points")}>
        <Text style={styles.jumpLink}>Open points system →</Text>
      </Pressable>

      <View style={[styles.card, shadows.card]}>
        <Text style={styles.cardLabel}>Balance</Text>
        <Text style={styles.balance}>
          {formatPointsDisplay(walletBalanceRaw)} <Text style={styles.currency}>{walletCurrencyCode}</Text>
        </Text>
        {walletLastRedemptionAt ? (
          <Text style={styles.mutedSmall}>Last redemption: {formatWhen(walletLastRedemptionAt)}</Text>
        ) : walletShowingLocalFallback && localWallet ? (
          <Text style={styles.mutedSmall}>Local balance updated: {formatWhen(localWallet.lastUpdated)}</Text>
        ) : (
          <Text style={styles.mutedSmall}>No catalog redemptions yet.</Text>
        )}
        {walletShowingLocalFallback ? (
          <Text style={styles.mutedSmall}>Showing latest points from this device while wallet sync completes.</Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>History</Text>
      {walletShowingLocalFallback ? (
        <>
          {localTransactions.length === 0 ? <Text style={styles.muted}>No local points activity yet.</Text> : null}
          {localTransactions.map((tx) => (
            <View key={tx.id} style={styles.ledgerRow}>
              <Text style={[styles.ledgerDelta, { color: tx.points > 0 ? colors.success : colors.text }]}>
                +{formatPointsDisplay(tx.points)}
              </Text>
              <Text style={styles.ledgerMeta}>{tx.action}</Text>
              <Text style={styles.ledgerDate}>{formatWhen(tx.createdAt)}</Text>
            </View>
          ))}
        </>
      ) : (
        <>
          {ledgerInfinite.isLoading ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} /> : null}
          {ledger404 ? <Text style={styles.muted}>History is not available on this server.</Text> : null}
          {!ledger404 && ledgerInfinite.isError ? (
            <Text style={styles.error}>{(ledgerInfinite.error as Error).message}</Text>
          ) : null}
          {!ledger404 && !ledgerInfinite.isLoading && ledgerRows.length === 0 ? (
            <Text style={styles.muted}>No ledger entries yet.</Text>
          ) : null}
          {ledgerRows.map((row) => (
            <LedgerBlock key={row.id} row={row} />
          ))}
          {ledgerInfinite.hasNextPage ? (
            <Pressable
              style={styles.loadMore}
              disabled={ledgerInfinite.isFetchingNextPage}
              onPress={() => void ledgerInfinite.fetchNextPage()}
            >
              <Text style={styles.loadMoreText}>{ledgerInfinite.isFetchingNextPage ? "Loading…" : "Load more"}</Text>
            </Pressable>
          ) : null}
        </>
      )}
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  jumpLink: { fontSize: 14, color: colors.accent, fontWeight: "600", marginBottom: 4 },
  card: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    padding: 18,
    gap: 6
  },
  cardLabel: { fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  balance: { fontSize: 28, fontWeight: "700", color: colors.text, letterSpacing: -0.5 },
  currency: { fontSize: 16, fontWeight: "500", color: colors.muted },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  mutedSmall: { fontSize: 13, color: colors.muted, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: colors.text, marginTop: 8 },
  ledgerRow: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    padding: 14,
    gap: 4
  },
  ledgerDelta: { fontSize: 17, fontWeight: "700" },
  ledgerMeta: { fontSize: 14, color: colors.text },
  ledgerDate: { fontSize: 12, color: colors.muted },
  loadMore: {
    alignSelf: "center",
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card
  },
  loadMoreText: { fontSize: 14, fontWeight: "600", color: colors.text },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 }
});
