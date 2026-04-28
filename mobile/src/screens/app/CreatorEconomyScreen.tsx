import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { apiRequest } from "../../lib/api";
import { getPayoutSetupCopy, isPayoutSetupComplete } from "../../lib/payout-setup";
import { colors, primaryButtonOutline, radii } from "../../theme";

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
  const profileQuery = useQuery({
    queryKey: ["mobile-creator-profile-capabilities"],
    queryFn: () =>
      apiRequest<{
        profile_kind?: "consumer" | "professional" | "business_interest" | null;
        persona_capabilities?: {
          can_access_creator_hub?: boolean;
          can_manage_memberships?: boolean;
          can_use_affiliate_tools?: boolean;
        };
      }>("/users/me", { auth: true })
  });
  const plaidStatusQuery = useQuery({
    queryKey: ["mobile-plaid-status"],
    queryFn: () =>
      apiRequest<{ configured: boolean; linked?: boolean; institutionName?: string | null }>(
        "/monetization/plaid/status",
        { auth: true }
      )
  });
  const canAccessCreatorHub = Boolean(profileQuery.data?.persona_capabilities?.can_access_creator_hub);
  const canManageMemberships = Boolean(profileQuery.data?.persona_capabilities?.can_manage_memberships);
  const canUseAffiliateTools = Boolean(profileQuery.data?.persona_capabilities?.can_use_affiliate_tools);

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
  const [connectingAndOpening, setConnectingAndOpening] = useState(false);
  const startGettingPaid = async () => {
    if (connectingAndOpening || onboardingMutation.isPending) {
      return;
    }
    setConnectingAndOpening(true);
    try {
      await connectAccountMutation.mutateAsync();
      await connectStatusQuery.refetch();
      const onboarding = await onboardingMutation.mutateAsync();
      if (!onboarding?.url) {
        throw new Error("Stripe onboarding link was not returned. Please try again.");
      }
    } catch (error) {
      Alert.alert("Stripe setup", error instanceof Error ? error.message : "Could not start Stripe setup.");
    } finally {
      setConnectingAndOpening(false);
    }
  };

  if (connectStatusQuery.isLoading) {
    return <LoadingState label="Loading creator hub..." />;
  }
  if (connectStatusQuery.error) {
    return <ErrorState message={(connectStatusQuery.error as Error).message} />;
  }

  const connected = Boolean(connectStatusQuery.data?.connected);
  const stripeSetupComplete = isPayoutSetupComplete(connectStatusQuery.data);
  const payoutCopy = getPayoutSetupCopy(connectStatusQuery.data);
  const showConnectGuide = !stripeSetupComplete;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.lede}>
        Get paid, manage your catalog, and see earnings. For full controls, use Creator hub on the web.
      </Text>

      <Pressable style={styles.addProductBtn} onPress={() => navigation.navigate("CreateProduct")}>
        <Text style={styles.addProductBtnText}>Add product</Text>
      </Pressable>

      {canAccessCreatorHub ? (
        <Pressable style={styles.promoteBtn} onPress={() => navigation.navigate("PromotePost")}>
          <Text style={styles.promoteBtnText}>Promote in feed (post or event)</Text>
        </Pressable>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Get paid</Text>
        <Text style={styles.muted}>
          {stripeSetupComplete
            ? payoutCopy.subline
            : "Two quick steps, one time — secured by Stripe."}
        </Text>
        {showConnectGuide ? (
          <View style={styles.guideCard}>
            <Text style={styles.guideTitle}>{payoutCopy.headline}</Text>
            <Text style={[styles.muted, styles.guideSub]}>{payoutCopy.subline}</Text>
            <View style={styles.guideList}>
              <Text style={[styles.guideItem, !connected && styles.guideItemActive]}>
                1. <Text style={styles.guideItemStrong}>{payoutCopy.step1Label}</Text> — {payoutCopy.step1Body}
              </Text>
              <Text style={[styles.guideItem, connected && !stripeSetupComplete && styles.guideItemActive]}>
                2. <Text style={styles.guideItemStrong}>{payoutCopy.step2Label}</Text> — {payoutCopy.step2Body}
              </Text>
            </View>
            <Text style={[styles.muted, styles.guideSub]}>
              Back from the form? Pull to refresh or reopen this screen if status looks outdated.
            </Text>
          </View>
        ) : null}
        <View style={styles.statusList}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Profile linked</Text>
            <Text style={styles.statusValue}>{triState(connectStatusQuery.data?.connected)}</Text>
          </View>
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
              onPress={() => {
                void startGettingPaid();
              }}
              disabled={connectingAndOpening || connectAccountMutation.isPending || onboardingMutation.isPending}
            >
              <Text style={styles.buttonText}>
                {connectingAndOpening || connectAccountMutation.isPending || onboardingMutation.isPending
                  ? "Opening Stripe…"
                  : "Start getting paid"}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => onboardingMutation.mutate()}
            disabled={onboardingMutation.isPending || !connected}
          >
            <Text style={styles.buttonText}>
              {onboardingMutation.isPending ? "Opening…" : "Continue secure setup (~5 min)"}
            </Text>
          </Pressable>
          {connectStatusQuery.data?.dashboardUrl ? (
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => void Linking.openURL(connectStatusQuery.data?.dashboardUrl || "")}
            >
              <Text style={styles.buttonText}>Update bank or tax info</Text>
            </Pressable>
          ) : null}
        </View>
        {plaidStatusQuery.data?.configured ? (
          <View style={styles.plaidHint}>
            <Text style={styles.muted}>
              US sellers: link a bank with Plaid (WebView), then we attach it to Stripe for payouts. Complete Stripe
              onboarding first.
            </Text>
            {plaidStatusQuery.data?.linked ? (
              <Text style={styles.muted}>
                Plaid linked{plaidStatusQuery.data.institutionName ? ` · ${plaidStatusQuery.data.institutionName}` : ""}.
              </Text>
            ) : null}
            <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("PlaidLink")}>
              <Text style={styles.buttonText}>
                {plaidStatusQuery.data?.linked ? "Re-link bank (Plaid)" : "Link bank (Plaid)"}
              </Text>
            </Pressable>
          </View>
        ) : null}
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
              <Text style={styles.kindPill}>
                {item.product_type === "subscription" ? "Recurring" : "One-time"}
              </Text>{" "}
              {item.title}
              <Text style={styles.muted}> · {(item.platform_fee_bps / 100).toFixed(1)}% fee</Text>
            </Text>
          ))
        ) : (
          <EmptyState title="No products yet" subtitle="Add from the Create tab → Product, or use the web Creator hub." />
        )}
      </View>

      {canManageMemberships ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Membership plans</Text>
          {(tiersQuery.data?.items || []).length ? (
            tiersQuery.data?.items.slice(0, 8).map((tier) => (
              <Text key={tier.id} style={styles.listLine}>
                <Text style={styles.kindPill}>Monthly</Text> {tier.title}
                <Text style={styles.muted}>
                  {" "}
                  · {formatMinorCurrency(tier.monthly_price_minor, tier.currency)}/mo
                </Text>
              </Text>
            ))
          ) : (
            <EmptyState title="No plans yet" subtitle="Create tab → Product, then choose Monthly membership." />
          )}
        </View>
      ) : null}

      {canUseAffiliateTools ? (
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
      ) : null}
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
    borderRadius: radii.control,
    paddingVertical: 12,
    ...primaryButtonOutline
  },
  addProductBtnText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "600"
  },
  promoteBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.surface
  },
  promoteBtnText: {
    color: colors.text,
    fontSize: 15,
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
    borderColor: colors.borderSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    backgroundColor: colors.surfaceTinted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6
  },
  guideTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700"
  },
  guideSub: {
    marginTop: 4
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
  kindPill: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2
  },
  plaidHint: {
    marginTop: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: 10
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
