import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fetchSessionMe, logout } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { useSessionStore } from "../../store/session-store";
import { SettingsRow, SettingsSection } from "../../components/SettingsSection";
import { colors, radii, shadows, spacing } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { fetchMyEarnings, fetchConnectStatus, formatMinorCurrency } from "../../lib/monetization";
import { USAGE_PERSONA_OPTIONS, type UsagePersonaKey } from "../../lib/onboarding-options";
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
        profile_kind?: "consumer" | "professional" | "business_interest" | null;
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
  const usagePersonaMutation = useMutation({
    mutationFn: (usagePersona: UsagePersonaKey) =>
      apiRequest("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: { usagePersona }
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-account-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-user-me-onboarding"] });
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
  const activePersona: UsagePersonaKey =
    p?.profile_kind === "business_interest"
      ? "business"
      : p?.profile_kind === "professional"
        ? "professional"
        : "personal";

  const sessionEmail = sessionQuery.data?.email?.trim();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {sessionEmail ? (
        <Text style={styles.signedInHint} numberOfLines={1}>
          Signed in as {sessionEmail}
        </Text>
      ) : null}

      {p ? (
        <View style={[styles.summary, shadows.card]}>
          <Text style={styles.summaryTitle}>Activity</Text>
          <Text style={styles.summaryLine}>
            {p.posts_count} posts · {p.followers_count} followers · {p.following_count} following
          </Text>
          <Text style={styles.summaryLine}>
            {p.likes_received_count} likes received · {p.likes_given_count} you gave
          </Text>
        </View>
      ) : null}

      <SettingsSection title="General">
        <SettingsRow
          title="Navigate"
          subtitle="Jump to any main tab in one tap."
          onPress={() => navigation.navigate("NavigateApp")}
        />
        <SettingsRow
          title="Edit profile"
          subtitle="Display name, bio, and business line."
          onPress={() => navigation.navigate("EditProfile")}
        />
        <SettingsRow
          title="Purchases"
          subtitle="Order history and digital access."
          onPress={() => navigation.navigate("Purchases")}
        />
        <SettingsRow
          title="Creator hub"
          subtitle={
            creatorConnectQuery.data?.connected
              ? `Payouts · ${formatMinorCurrency(creatorEarningsQuery.data?.totals?.balance_minor || 0, "usd")} available`
              : "Stripe Connect and your catalog."
          }
          onPress={() => navigation.navigate("CreatorEconomy")}
        />
        <SettingsRow
          title="New listing"
          subtitle="Add a product without a post."
          onPress={() => navigation.navigate("CreateProduct")}
        />
        <SettingsRow
          title="Feed & defaults"
          subtitle="Interests and how the app opens."
          onPress={() => navigation.navigate("Onboarding")}
        />
        <SettingsRow
          title="Sessions"
          subtitle="Devices where you stay signed in."
          onPress={() => navigation.navigate("Sessions")}
        />
        <SettingsRow
          title="Inbox"
          subtitle="Alerts and updates."
          onPress={() => navigation.navigate("Notifications")}
        />
      </SettingsSection>

      <SettingsSection title="How you use Deenly">
        <View style={styles.personaList}>
          {USAGE_PERSONA_OPTIONS.map((option) => {
            const active = activePersona === option.key;
            return (
              <Pressable
                key={option.key}
                style={[styles.personaCard, active ? styles.personaCardActive : null]}
                onPress={() => usagePersonaMutation.mutate(option.key)}
                disabled={usagePersonaMutation.isPending}
              >
                <Text style={styles.personaTitle}>{option.label}</Text>
                <Text style={styles.personaSub}>{option.subtitle}</Text>
              </Pressable>
            );
          })}
        </View>
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingsRow
          title="Log out"
          destructive
          showChevron={false}
          onPress={handleLogout}
          accessibilityLabel="Log out of Deenly"
        />
      </SettingsSection>

      <View style={[styles.igCard, shadows.card]}>
        <Text style={styles.igTitle}>Instagram</Text>
        <Text style={styles.igMuted}>
          Connect a Business or Creator account (Facebook Page). You will complete sign-in in the browser, then return
          here.
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
        <SettingsRow title="Dhikr" subtitle="Calm remembrance mode." onPress={() => navigation.navigate("Dhikr")} />
        <SettingsRow title="Quran" subtitle="Reader and navigation." onPress={() => navigation.navigate("QuranReader")} />
        <SettingsRow title="Salah" subtitle="Prayer notifications and method." onPress={() => navigation.navigate("SalahSettings")} />
      </SettingsSection>

      <SettingsSection title="Support">
        <SettingsRow title="Beta" subtitle="Early access and feedback." onPress={() => navigation.navigate("Beta")} />
        <SettingsRow title="Help center" subtitle="Contact and questions." onPress={() => navigation.navigate("Support")} />
        <SettingsRow title="Guidelines" subtitle="Community standards." onPress={() => navigation.navigate("Guidelines")} />
      </SettingsSection>

      {isOwnerAdmin ? (
        <SettingsSection title="Admin">
          <SettingsRow
            title="Admin console"
            subtitle="Moderation, operations, analytics."
            onPress={() => navigation.navigate("AdminHub")}
          />
        </SettingsSection>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 8,
    paddingBottom: spacing.screenBottom,
    gap: spacing.sectionGap
  },
  signedInHint: {
    fontSize: 13,
    color: colors.muted,
    letterSpacing: -0.1,
    marginBottom: -8
  },
  summary: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    padding: 18,
    gap: 8
  },
  summaryTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2
  },
  summaryLine: { fontSize: 14, color: colors.text, lineHeight: 20, letterSpacing: -0.2 },
  personaList: { gap: 10 },
  personaCard: {
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  personaCardActive: {
    borderColor: colors.text,
    backgroundColor: colors.subtleFill
  },
  personaTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  personaSub: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  igCard: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    padding: 18,
    gap: 10
  },
  igTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  igMuted: { fontSize: 14, color: colors.text, lineHeight: 21, letterSpacing: -0.2, opacity: 0.85 },
  igRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  smallBtn: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.subtleFill
  },
  smallBtnText: { fontWeight: "600", color: colors.text, fontSize: 14, letterSpacing: -0.2 }
});
