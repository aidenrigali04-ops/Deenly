import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { fetchRewardsWalletMe } from "../../lib/rewards-api";
import { ApiError } from "../../lib/api";
import { colors, radii, shadows, spacing } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import type { RewardsLedgerEntryDto } from "@deenly/rewards";
import { useRewardsLedgerInfiniteQuery, useRewardsWalletMeQuery } from "../../hooks/use-rewards-wallet";

type Props = NativeStackScreenProps<RootStackParamList, "RewardsWallet">;

function formatPointsDisplay(raw: string): string {
  try {
    return BigInt(raw).toLocaleString("en-US");
  } catch {
    return raw;
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
    if (n > 0n) tone = "#065f46";
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
  const walletQuery = useRewardsWalletMeQuery(true);
  const ledgerInfinite = useRewardsLedgerInfiniteQuery(!walletQuery.isLoading && !walletQuery.error);

  const ledgerRows = useMemo(
    () => ledgerInfinite.data?.pages.flatMap((p) => [...p.items]) ?? [],
    [ledgerInfinite.data?.pages]
  );

  if (walletQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (walletQuery.error instanceof ApiError && walletQuery.error.status === 404) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.error}>Rewards are not available on this server yet.</Text>
      </ScrollView>
    );
  }

  if (walletQuery.isError || !walletQuery.data) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.error}>{(walletQuery.error as Error)?.message || "Could not load rewards."}</Text>
      </ScrollView>
    );
  }

  const w = walletQuery.data;
  const ledger404 = ledgerInfinite.error instanceof ApiError && ledgerInfinite.error.status === 404;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Pressable onPress={() => navigation.navigate("Referrals")}>
        <Text style={styles.jumpLink}>Open referrals →</Text>
      </Pressable>

      <View style={[styles.card, shadows.card]}>
        <Text style={styles.cardLabel}>Balance</Text>
        <Text style={styles.balance}>
          {formatPointsDisplay(w.balancePoints)} <Text style={styles.currency}>{w.currencyCode}</Text>
        </Text>
        {w.lastCatalogCheckoutRedemptionAt ? (
          <Text style={styles.mutedSmall}>Last redemption: {formatWhen(w.lastCatalogCheckoutRedemptionAt)}</Text>
        ) : (
          <Text style={styles.mutedSmall}>No catalog redemptions yet.</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>History</Text>
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
