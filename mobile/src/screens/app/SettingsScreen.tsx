import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fetchSessionMe, logout } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { useSessionStore } from "../../store/session-store";
import { SettingsRow, SettingsSection } from "../../components/SettingsSection";
import { colors, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { fetchMyEarnings, fetchConnectStatus, formatMinorCurrency } from "../../lib/monetization";
import {
  disconnectInstagram,
  fetchInstagramOAuthUrl,
  fetchInstagramStatus
} from "../../lib/instagram";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export function SettingsScreen({ navigation }: Props) {
  const setUser = useSessionStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const adminOwnerEmail = String(process.env.EXPO_PUBLIC_ADMIN_OWNER_EMAIL || "").toLowerCase();

  const sessionQuery = useQuery({
    queryKey: ["mobile-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const profileQuery = useQuery({
    queryKey: ["mobile-account-profile"],
    queryFn: () =>
      apiRequest<{
        posts_count: number;
        followers_count: number;
        following_count: number;
        likes_received_count: number;
        likes_given_count: number;
      }>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const instagramQuery = useQuery({
    queryKey: ["mobile-instagram-status"],
    queryFn: () => fetchInstagramStatus(),
    enabled: Boolean(sessionQuery.data?.id),
    retry: false
  });
  const creatorConnectQuery = useQuery({
    queryKey: ["mobile-creator-connect-status"],
    queryFn: () => fetchConnectStatus(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const creatorEarningsQuery = useQuery({
    queryKey: ["mobile-creator-earnings"],
    queryFn: () => fetchMyEarnings(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const disconnectInstagramMutation = useMutation({
    mutationFn: () => disconnectInstagram(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-instagram-status"] });
    }
  });

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  const isOwnerAdmin =
    !!sessionQuery.data &&
    ["admin", "moderator"].includes(sessionQuery.data.role) &&
    String(sessionQuery.data.email || "").toLowerCase() === adminOwnerEmail;

  const p = profileQuery.data;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {p ? (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Overview</Text>
          <Text style={styles.summaryLine}>
            {p.posts_count} posts · {p.followers_count} followers · {p.following_count} following
          </Text>
          <Text style={styles.summaryLine}>
            Likes received {p.likes_received_count} · Likes by you {p.likes_given_count}
          </Text>
        </View>
      ) : null}

      <SettingsSection title="Account">
        <SettingsRow title="Sessions" subtitle="Signed-in devices" onPress={() => navigation.navigate("Sessions")} />
        <SettingsRow title="Log out" onPress={handleLogout} accessibilityLabel="Log out of Deenly" />
      </SettingsSection>

      <SettingsSection title="Creator">
        <SettingsRow
          title="Creator hub"
          subtitle={
            creatorConnectQuery.data?.connected
              ? `Stripe · ${formatMinorCurrency(creatorEarningsQuery.data?.totals?.balance_minor || 0, "usd")} balance`
              : "Payments & payouts"
          }
          onPress={() => navigation.navigate("CreatorEconomy")}
        />
        <SettingsRow
          title="Add product"
          subtitle="Create a listing without attaching a post"
          onPress={() => navigation.navigate("CreateProduct")}
        />
      </SettingsSection>

      <View style={styles.igCard}>
        <Text style={styles.igTitle}>Instagram</Text>
        <Text style={styles.igMuted}>
          Business/Creator via Facebook Page. OAuth opens in the browser; return here when done.
        </Text>
        {instagramQuery.isError ? (
          <Text style={styles.igMuted}>Instagram is not configured on this server.</Text>
        ) : instagramQuery.data?.connected ? (
          <View style={styles.igRow}>
            <Text style={styles.igMuted}>
              Connected{instagramQuery.data.igUsername ? ` @${instagramQuery.data.igUsername}` : ""}
            </Text>
            <Pressable
              style={styles.smallBtn}
              onPress={() => disconnectInstagramMutation.mutate()}
              disabled={disconnectInstagramMutation.isPending}
            >
              <Text style={styles.smallBtnText}>{disconnectInstagramMutation.isPending ? "…" : "Disconnect"}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.smallBtn}
            onPress={async () => {
              try {
                const { url } = await fetchInstagramOAuthUrl();
                await Linking.openURL(url);
              } catch {
                /* ignore */
              }
            }}
          >
            <Text style={styles.smallBtnText}>Connect Instagram</Text>
          </Pressable>
        )}
      </View>

      <SettingsSection title="Deen">
        <SettingsRow title="Dhikr" onPress={() => navigation.navigate("Dhikr")} />
        <SettingsRow title="Quran reader" onPress={() => navigation.navigate("QuranReader")} />
        <SettingsRow title="Salah settings" onPress={() => navigation.navigate("SalahSettings")} />
      </SettingsSection>

      <SettingsSection title="Help">
        <SettingsRow title="Beta program" onPress={() => navigation.navigate("Beta")} />
        <SettingsRow title="Support" onPress={() => navigation.navigate("Support")} />
        <SettingsRow title="Community guidelines" onPress={() => navigation.navigate("Guidelines")} />
      </SettingsSection>

      {isOwnerAdmin ? (
        <SettingsSection title="Administration">
          <SettingsRow title="Admin tools" subtitle="Moderation, ops, analytics, tables" onPress={() => navigation.navigate("AdminHub")} />
        </SettingsSection>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 22 },
  summary: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 16,
    gap: 6
  },
  summaryTitle: { fontSize: 13, fontWeight: "700", color: colors.text },
  summaryLine: { fontSize: 13, color: colors.muted },
  igCard: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 16,
    gap: 8
  },
  igTitle: { fontSize: 13, fontWeight: "700", color: colors.text },
  igMuted: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  igRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  smallBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  smallBtnText: { fontWeight: "600", color: colors.text, fontSize: 14 }
});
