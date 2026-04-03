import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { RootStackParamList } from "../../navigation/AppNavigator";
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

function triState(value: boolean | undefined) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

export function CreatorEconomyScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
  const detailsSubmitted = Boolean(connectStatusQuery.data?.detailsSubmitted);
  const chargesEnabled = Boolean(connectStatusQuery.data?.chargesEnabled);
  const payoutsEnabled = Boolean(connectStatusQuery.data?.payoutsEnabled);
  const stripeSetupComplete = connected && detailsSubmitted && chargesEnabled;
  const showConnectGuide = !stripeSetupComplete;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.lede}>
        Payouts and a quick read on your catalog. Add products below; use the web Creator hub for bulk edits and tiers.
      </Text>

      <Pressable style={styles.addProductBtn} onPress={() => navigation.navigate("CreateProduct")}>
        <Text style={styles.addProductBtnText}>Add product</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Payouts</Text>
        <Text style={styles.muted}>
          Stripe {connected ? "connected" : "not connected yet"} — link your account to receive earnings.
        </Text>
        {showConnectGuide ? (
          <View style={styles.guideCard}>
            <Text style={styles.guideTitle}>Steps to connect Stripe</Text>
            <View style={styles.guideList}>
              <Text style={[styles.guideItem, !connected && styles.guideItemActive]}>
                1. <Text style={styles.guideItemStrong}>Connect Stripe account</Text> — Deenly links your Stripe Express
                account for payouts.
              </Text>
              <Text style={[styles.guideItem, connected && !chargesEnabled && styles.guideItemActive]}>
                2. <Text style={styles.guideItemStrong}>Finish in Stripe</Text> — add business details, identity, and bank
                info.
              </Text>
              <Text style={styles.guideItem}>
                3. <Text style={styles.guideItemStrong}>Return to Deenly</Text> — status below updates when charges and
                payouts are enabled.
              </Text>
            </View>
          </View>
        ) : null}
        <View style={styles.statusList}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Details submitted</Text>
            <Text style={styles.statusValue}>{triState(connectStatusQuery.data?.detailsSubmitted)}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Charges enabled</Text>
            <Text style={styles.statusValue}>{triState(connectStatusQuery.data?.chargesEnabled)}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Payouts enabled</Text>
            <Text style={styles.statusValue}>{triState(connectStatusQuery.data?.payoutsEnabled)}</Text>
          </View>
        </View>
        <View style={styles.row}>
          {!connected ? (
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => connectAccountMutation.mutate()}
              disabled={connectAccountMutation.isPending}
            >
              <Text style={styles.buttonText}>
                {connectAccountMutation.isPending ? "Connecting…" : "Connect Stripe account"}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => onboardingMutation.mutate()}
            disabled={onboardingMutation.isPending || !connected}
          >
            <Text style={styles.buttonText}>
              {onboardingMutation.isPending ? "Opening…" : "Continue setup in Stripe"}
            </Text>
          </Pressable>
          {connectStatusQuery.data?.dashboardUrl ? (
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => void Linking.openURL(connectStatusQuery.data?.dashboardUrl || "")}
            >
              <Text style={styles.buttonText}>Open Stripe dashboard</Text>
            </Pressable>
          ) : null}
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
        <Text style={styles.sectionTitle}>Membership plans</Text>
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
          <EmptyState title="No plans yet" subtitle="Create membership plans from web Creator hub -> Grow." />
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
  addProductBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.control,
    paddingVertical: 12,
    alignItems: "center"
  },
  addProductBtnText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "700"
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    padding: 14,
    gap: 10
  },
  guideCard: {
    borderColor: "#bfdbfe",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    backgroundColor: "#f0f9ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6
  },
  guideTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700"
  },
  guideList: {
    gap: 6
  },
  guideItem: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
  },
  guideItemStrong: {
    color: colors.text,
    fontWeight: "600"
  },
  guideItemActive: {
    color: colors.text,
    fontWeight: "600"
  },
  statusList: {
    gap: 4
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  statusLabel: {
    color: colors.muted,
    fontSize: 12
  },
  statusValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600"
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
