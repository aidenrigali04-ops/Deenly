import { useCallback } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchReferralsMe, postReferralShareRecorded } from "../../lib/rewards-api";
import { ApiError } from "../../lib/api";
import { colors, radii, shadows, spacing } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Referrals">;

function attributionHeadline(status: string): string {
  switch (status) {
    case "pending_purchase":
      return "Waiting for your first qualifying purchase";
    case "pending_clear":
      return "Reward pending — clearing period";
    case "qualified":
      return "Referral completed";
    case "rejected":
      return "Not eligible";
    case "voided":
      return "Voided";
    case "expired":
      return "Expired";
    default:
      return status.replace(/_/g, " ");
  }
}

export function ReferralsScreen({ navigation }: Props) {
  const query = useQuery({
    queryKey: ["referrals", "me"],
    queryFn: () => fetchReferralsMe()
  });
  const shareMutation = useMutation({
    mutationFn: (surface?: string) => postReferralShareRecorded(surface ? { surface } : {})
  });

  const shareUrl = query.data?.code?.suggestedShareUrl ?? "";

  const recordShare = useCallback(
    async (surface: string) => {
      try {
        await shareMutation.mutateAsync(surface);
      } catch {
        /* best-effort analytics */
      }
    },
    [shareMutation]
  );

  const shareInvite = useCallback(async () => {
    if (!shareUrl) {
      Alert.alert("Referrals", "No share link is configured yet.");
      return;
    }
    try {
      await Share.share({
        title: "Join me on Deenly",
        message: `Join me on Deenly: ${shareUrl}`,
        url: shareUrl
      });
      void recordShare("native_share");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        Alert.alert("Share", "Could not open the share sheet.");
      }
    }
  }, [recordShare, shareUrl]);

  if (query.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.error}>Referrals are not enabled on this server.</Text>
      </ScrollView>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.error}>{(query.error as Error)?.message || "Could not load referrals."}</Text>
      </ScrollView>
    );
  }

  const data = query.data;
  const code = data.code;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Pressable onPress={() => navigation.navigate("RewardsWallet")}>
        <Text style={styles.jumpLink}>← Rewards wallet</Text>
      </Pressable>

      <Text style={styles.lede}>Share your code. Rewards follow program rules when referrals qualify.</Text>

      <View style={[styles.card, shadows.card]}>
        <Text style={styles.cardTitle}>Your code</Text>
        {code ? (
          <>
            <Text style={styles.code}>{code.code}</Text>
            <Text style={styles.meta}>
              {code.status} · attributed signups {code.attributableSignupsCount} · cap {code.maxRedemptions}
            </Text>
            {shareUrl ? (
              <>
                <Text style={styles.url} selectable>
                  {shareUrl}
                </Text>
                <Pressable style={styles.primaryBtn} onPress={() => void shareInvite()}>
                  <Text style={styles.primaryBtnText}>Share invite</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.muted}>Configure app base URL for a ready-made invite link.</Text>
            )}
          </>
        ) : (
          <Text style={styles.muted}>No referral code is available yet.</Text>
        )}
      </View>

      <View style={[styles.card, shadows.card]}>
        <Text style={styles.cardTitle}>As a referrer</Text>
        <Text style={styles.body}>Qualified referrals: {data.qualifiedReferralsCount}</Text>
      </View>

      {data.attributionAsReferee ? (
        <View style={[styles.card, shadows.card]}>
          <Text style={styles.cardTitle}>You were invited</Text>
          <Text style={styles.body}>{attributionHeadline(data.attributionAsReferee.status)}</Text>
          <Text style={styles.mutedSmall}>
            Since{" "}
            {data.attributionAsReferee.attributedAt
              ? new Date(data.attributionAsReferee.attributedAt).toLocaleString()
              : "—"}
          </Text>
        </View>
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
  lede: { fontSize: 14, color: colors.muted, lineHeight: 21 },
  card: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    padding: 18,
    gap: 8
  },
  cardTitle: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  code: { fontSize: 20, fontWeight: "700", letterSpacing: 1, color: colors.text, fontFamily: "Menlo" },
  meta: { fontSize: 13, color: colors.muted },
  url: { fontSize: 13, color: colors.text, lineHeight: 18 },
  primaryBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radii.control,
    marginTop: 6
  },
  primaryBtnText: { color: colors.onAccent, fontWeight: "700", fontSize: 15 },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  muted: { fontSize: 14, color: colors.muted },
  mutedSmall: { fontSize: 12, color: colors.muted },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 }
});
