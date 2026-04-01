import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import {
  createAffiliateCode,
  createConnectAccount,
  createOnboardingLink,
  fetchAffiliateCodes,
  fetchConnectStatus,
  fetchMyEarnings,
  fetchMyProducts,
  fetchMyTiers,
  formatMinorCurrency
} from "../../lib/monetization";
import { colors, radii } from "../../theme";

export function CreatorEconomyScreen() {
  const connectStatusQuery = useQuery({
    queryKey: ["mobile-creator-connect-status"],
    queryFn: () => fetchConnectStatus()
  });
  const productsQuery = useQuery({
    queryKey: ["mobile-creator-products"],
    queryFn: () => fetchMyProducts()
  });
  const tiersQuery = useQuery({
    queryKey: ["mobile-creator-tiers"],
    queryFn: () => fetchMyTiers()
  });
  const earningsQuery = useQuery({
    queryKey: ["mobile-creator-earnings"],
    queryFn: () => fetchMyEarnings()
  });
  const affiliateCodesQuery = useQuery({
    queryKey: ["mobile-creator-affiliate-codes"],
    queryFn: () => fetchAffiliateCodes()
  });

  const connectAccountMutation = useMutation({
    mutationFn: () => createConnectAccount(),
    onSuccess: () => connectStatusQuery.refetch()
  });
  const onboardingMutation = useMutation({
    mutationFn: () => createOnboardingLink(),
    onSuccess: async (result) => {
      if (result?.url) {
        await Linking.openURL(result.url);
      }
    }
  });
  const affiliateCodeMutation = useMutation({
    mutationFn: () => createAffiliateCode(),
    onSuccess: () => affiliateCodesQuery.refetch()
  });

  if (connectStatusQuery.isLoading) {
    return <LoadingState label="Loading creator hub..." />;
  }
  if (connectStatusQuery.error) {
    return <ErrorState message={(connectStatusQuery.error as Error).message} />;
  }

  const connected = Boolean(connectStatusQuery.data?.connected);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.lede}>
        Payouts and a quick read on your catalog. Create or edit products and tiers on the web Creator hub when you need
        full tools.
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Payouts</Text>
        <Text style={styles.muted}>
          Stripe {connected ? "connected" : "not connected yet"} — link your account to receive earnings.
        </Text>
        <View style={styles.row}>
          {!connected ? (
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => connectAccountMutation.mutate()}
              disabled={connectAccountMutation.isPending}
            >
              <Text style={styles.buttonText}>
                {connectAccountMutation.isPending ? "Working…" : "Connect Stripe"}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => onboardingMutation.mutate()}
            disabled={onboardingMutation.isPending || !connected}
          >
            <Text style={styles.buttonText}>
              {onboardingMutation.isPending ? "Opening…" : "Continue in Stripe"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Balance</Text>
        <Text style={styles.balance}>
          {formatMinorCurrency(earningsQuery.data?.totals?.balance_minor || 0, "usd")}
        </Text>
        <Text style={styles.muted}>Available in your connected Stripe account context.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Products</Text>
        {(productsQuery.data?.items || []).length ? (
          (productsQuery.data?.items || []).slice(0, 8).map((item) => (
            <Text key={item.id} style={styles.listLine}>
              {item.title}
              <Text style={styles.muted}> · {(item.platform_fee_bps / 100).toFixed(1)}% fee</Text>
            </Text>
          ))
        ) : (
          <EmptyState title="No products yet" subtitle="Add them from the web Creator hub → Products." />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Subscription tiers</Text>
        {(tiersQuery.data?.items || []).length ? (
          tiersQuery.data?.items.slice(0, 8).map((tier) => (
            <Text key={tier.id} style={styles.listLine}>
              {tier.title}
              <Text style={styles.muted}>
                {" "}
                · {formatMinorCurrency(tier.monthly_price_minor, tier.currency)}/mo
              </Text>
            </Text>
          ))
        ) : (
          <EmptyState title="No tiers yet" subtitle="Create tiers from the web Creator hub → Grow." />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Affiliate codes</Text>
        <Pressable
          style={styles.buttonSecondary}
          onPress={() => affiliateCodeMutation.mutate()}
          disabled={affiliateCodeMutation.isPending}
        >
          <Text style={styles.buttonText}>{affiliateCodeMutation.isPending ? "Creating…" : "New code"}</Text>
        </Pressable>
        {(affiliateCodesQuery.data?.items || []).length ? (
          <View style={styles.badgeWrap}>
            {(affiliateCodesQuery.data?.items || []).map((code) => (
              <View key={code.id} style={styles.badge}>
                <Text style={styles.badgeText}>
                  {code.code} ({code.uses_count})
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>No codes yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 14
  },
  lede: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    padding: 14,
    gap: 10
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700"
  },
  balance: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700"
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  listLine: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20
  },
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 14
  },
  badgeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  badge: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  badgeText: {
    color: colors.text,
    fontSize: 12
  }
});
