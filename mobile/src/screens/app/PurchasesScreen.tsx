import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchMyPurchases, formatMinorCurrency } from "../../lib/monetization";
import { colors, radii, shadows, spacing } from "../../theme";
import { usePoints } from "../../features/points";

function formatOrderStatus(raw: string) {
  const s = String(raw || "").replace(/_/g, " ").trim();
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function PurchasesScreen() {
  const points = usePoints();
  const query = useQuery({
    queryKey: ["mobile-purchases-me"],
    queryFn: () => fetchMyPurchases({ limit: 50 })
  });

  useEffect(() => {
    if (!query.data?.items || !points.userId) {
      return;
    }
    void points.syncCompletedOrders(
      query.data.items.map((row) => ({ order_id: row.order_id, status: row.status }))
    );
  }, [points.syncCompletedOrders, points.userId, query.data?.items]);

  if (query.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const items = query.data?.items || [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.lede}>Everything you have bought on Deenly, in one place.</Text>
      {query.isError ? (
        <Text style={styles.error}>{(query.error as Error).message}</Text>
      ) : null}
      {items.length === 0 ? (
        <View style={[styles.emptyCard, shadows.card]}>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.empty}>When you check out from a creator, receipts and access show up here.</Text>
        </View>
      ) : (
        items.map((row) => {
          const title =
            row.product_title || row.tier_title || (row.kind === "subscription" ? "Subscription" : "Purchase");
          const cur = (row.currency || "usd").toLowerCase();
          return (
            <View key={row.order_id} style={[styles.card, shadows.card]}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {title}
                </Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{formatOrderStatus(row.status)}</Text>
                </View>
              </View>
              <Text style={styles.cardAmount}>{formatMinorCurrency(Number(row.amount_minor || 0), cur)}</Text>
              <Text style={styles.cardSub}>
                Seller · @{row.seller_username}
                {row.seller_display_name ? ` (${row.seller_display_name})` : ""}
              </Text>
            </View>
          );
        })
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
  lede: { fontSize: 14, color: colors.muted, lineHeight: 21, letterSpacing: -0.2, marginBottom: 2 },
  emptyCard: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    padding: 22,
    gap: 8
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: colors.text, letterSpacing: -0.3 },
  empty: { fontSize: 14, color: colors.muted, lineHeight: 21, letterSpacing: -0.1 },
  error: { color: colors.danger, fontSize: 14 },
  card: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    padding: 16,
    gap: 8
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: "500", color: colors.text, letterSpacing: -0.2 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.subtleFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  statusPillText: { fontSize: 11, fontWeight: "600", color: colors.muted, letterSpacing: 0.2 },
  cardAmount: { fontSize: 15, fontWeight: "600", color: colors.text, letterSpacing: -0.2 },
  cardSub: { fontSize: 13, color: colors.muted, lineHeight: 18, letterSpacing: -0.1 }
});
