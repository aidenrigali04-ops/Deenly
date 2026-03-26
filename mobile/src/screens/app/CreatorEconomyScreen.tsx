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
import { colors } from "../../theme";

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
    return <LoadingState label="Loading creator economy..." />;
  }
  if (connectStatusQuery.error) {
    return <ErrorState message={(connectStatusQuery.error as Error).message} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Creator Economy</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Stripe Connect</Text>
        <Text style={styles.muted}>
          {connectStatusQuery.data?.connected ? "Connected" : "Not connected"}
        </Text>
        <View style={styles.row}>
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => connectAccountMutation.mutate()}
            disabled={connectAccountMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {connectAccountMutation.isPending ? "Creating..." : "Create account"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => onboardingMutation.mutate()}
            disabled={onboardingMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {onboardingMutation.isPending ? "Opening..." : "Open onboarding"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Earnings</Text>
        <Text style={styles.muted}>
          Balance: {formatMinorCurrency(earningsQuery.data?.totals?.balance_minor || 0, "usd")}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Products</Text>
        {(productsQuery.data?.items || []).length ? (
          (productsQuery.data?.items || []).slice(0, 5).map((item) => (
            <Text key={item.id} style={styles.muted}>
              {item.title} · {(item.platform_fee_bps / 100).toFixed(1)}% platform fee
            </Text>
          ))
        ) : (
          <EmptyState title="No products yet" subtitle="Create and publish products from web account tools." />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Tiers</Text>
        {(tiersQuery.data?.items || []).length ? (
          tiersQuery.data?.items.slice(0, 5).map((tier) => (
            <Text key={tier.id} style={styles.muted}>
              {tier.title} - {formatMinorCurrency(tier.monthly_price_minor, tier.currency)}/mo
            </Text>
          ))
        ) : (
          <EmptyState title="No tiers yet" subtitle="Create and publish monthly tiers from web account tools." />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Affiliate Codes</Text>
        <Pressable
          style={styles.buttonSecondary}
          onPress={() => affiliateCodeMutation.mutate()}
          disabled={affiliateCodeMutation.isPending}
        >
          <Text style={styles.buttonText}>
            {affiliateCodeMutation.isPending ? "Creating..." : "Create affiliate code"}
          </Text>
        </Pressable>
        <View style={styles.row}>
          {(affiliateCodesQuery.data?.items || []).map((code) => (
            <View key={code.id} style={styles.badge}>
              <Text style={styles.badgeText}>
                {code.code} ({code.uses_count})
              </Text>
            </View>
          ))}
        </View>
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
    padding: 14,
    gap: 12
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700"
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  title: {
    color: colors.text,
    fontWeight: "700"
  },
  muted: {
    color: colors.muted
  },
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  },
  badge: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  badgeText: {
    color: colors.text,
    fontSize: 12
  }
});
