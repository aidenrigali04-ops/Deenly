import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { apiRequest } from "../../lib/api";
import { fetchSessionMe } from "../../lib/auth";
import {
  createAdCampaign,
  fetchBoostCatalog,
  fetchMyAdCampaigns,
  startBoostCheckout,
  type AdCampaignRow,
  type BoostPackage
} from "../../lib/ads";
import { fetchEventsByHost, type EventRecord } from "../../lib/events";
import { formatMinorCurrency } from "../../lib/monetization";
import { colors, primaryButtonOutline, radii } from "../../theme";

type FeedRow = { id: number | string; content?: string | null };
type PromoteTarget = "post" | "event";

export function PromotePostScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useEffect(() => {
    void WebBrowser.maybeCompleteAuthSession();
  }, []);
  const [target, setTarget] = useState<PromoteTarget>("post");
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("feed_spotlight_7d");

  const sessionQuery = useQuery({
    queryKey: ["mobile-promote-session"],
    queryFn: () => fetchSessionMe()
  });
  const uid = sessionQuery.data?.id;

  const catalogQuery = useQuery({
    queryKey: ["mobile-ads-boost-catalog"],
    queryFn: () => fetchBoostCatalog()
  });
  const postsQuery = useQuery({
    queryKey: ["mobile-promote-feed", uid],
    queryFn: () =>
      apiRequest<{ items: FeedRow[] }>(`/feed?feedTab=for_you&authorId=${uid}&limit=30`, { auth: true }),
    enabled: Boolean(uid) && target === "post"
  });
  const eventsQuery = useQuery({
    queryKey: ["mobile-promote-events-host", uid],
    queryFn: () => fetchEventsByHost(uid!, { limit: 50 }),
    enabled: Boolean(uid) && target === "event"
  });
  const campaignsQuery = useQuery({
    queryKey: ["mobile-ads-campaigns-me"],
    queryFn: () => fetchMyAdCampaigns()
  });

  const postOptions = useMemo(
    () => (postsQuery.data?.items || []).filter((i): i is FeedRow & { id: number } => typeof i.id === "number"),
    [postsQuery.data?.items]
  );

  const eventOptions = useMemo(
    () => (eventsQuery.data?.items || []).filter((e: EventRecord) => e.status === "scheduled"),
    [eventsQuery.data?.items]
  );

  const packages: BoostPackage[] = catalogQuery.data?.items || [];

  const setTargetAndDefaults = (next: PromoteTarget) => {
    setTarget(next);
    setSelectedPostId(null);
    setSelectedEventId(null);
    setSelectedPackageId(next === "event" ? "event_highlight_7d" : "feed_spotlight_7d");
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (target === "post") {
        if (!selectedPostId) {
          return Promise.reject(new Error("Choose a post"));
        }
        return createAdCampaign({ postId: selectedPostId, packageId: selectedPackageId });
      }
      if (!selectedEventId) {
        return Promise.reject(new Error("Choose an event"));
      }
      return createAdCampaign({ eventId: selectedEventId, packageId: selectedPackageId });
    },
    onSuccess: async () => {
      await campaignsQuery.refetch();
    }
  });

  const payMutation = useMutation({
    mutationFn: (args: { campaignId: number; returnClient: "mobile_app" }) =>
      startBoostCheckout(args.campaignId, { returnClient: args.returnClient })
  });

  const openBoostCheckout = async (campaignId: number) => {
    try {
      const data = await payMutation.mutateAsync({ campaignId, returnClient: "mobile_app" });
      if (data?.url) {
        await WebBrowser.openBrowserAsync(data.url);
        await campaignsQuery.refetch();
      }
    } catch {
      /* error surfaced via payMutation.isError */
    }
  };

  if (sessionQuery.isLoading || catalogQuery.isLoading) {
    return <LoadingState label="Loading…" />;
  }
  if (sessionQuery.error) {
    return <ErrorState message={(sessionQuery.error as Error).message} />;
  }
  if (catalogQuery.error) {
    return <ErrorState message={(catalogQuery.error as Error).message} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.lede}>
        Create a draft boost for a post or scheduled event, pay in the browser, then wait for review.
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Promote</Text>
        <View style={styles.chipWrap}>
          <Pressable
            style={[styles.chip, target === "post" && styles.chipOn]}
            onPress={() => setTargetAndDefaults("post")}
          >
            <Text style={[styles.chipText, target === "post" && styles.chipTextOn]}>Post</Text>
          </Pressable>
          <Pressable
            style={[styles.chip, target === "event" && styles.chipOn]}
            onPress={() => setTargetAndDefaults("event")}
          >
            <Text style={[styles.chipText, target === "event" && styles.chipTextOn]}>Event</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{target === "post" ? "1. Post" : "1. Event"}</Text>
        {target === "post" ? (
          postsQuery.isLoading ? (
            <Text style={styles.muted}>Loading posts…</Text>
          ) : postOptions.length === 0 ? (
            <EmptyState title="No posts yet" subtitle="Create a post from the Create tab, then return here." />
          ) : (
            <View style={styles.chipWrap}>
              {postOptions.slice(0, 24).map((p) => {
                const on = selectedPostId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setSelectedPostId(p.id)}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={2}>
                      #{p.id}
                      {p.content ? ` · ${String(p.content).slice(0, 40)}${String(p.content).length > 40 ? "…" : ""}` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )
        ) : eventsQuery.isLoading ? (
          <Text style={styles.muted}>Loading events…</Text>
        ) : eventOptions.length === 0 ? (
          <EmptyState title="No scheduled events" subtitle="Create a public scheduled event, then return here." />
        ) : (
          <View style={styles.chipWrap}>
            {eventOptions.map((ev) => {
              const on = selectedEventId === ev.id;
              return (
                <Pressable
                  key={ev.id}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setSelectedEventId(ev.id)}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={3}>
                    {ev.title}
                    <Text style={styles.chipSub}>{"\n"}#{ev.id}</Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>2. Package</Text>
        <View style={styles.chipWrap}>
          {packages.map((pkg) => {
            const on = selectedPackageId === pkg.id;
            return (
              <Pressable
                key={pkg.id}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setSelectedPackageId(pkg.id)}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={3}>
                  {pkg.label}
                  {"\n"}
                  <Text style={styles.chipSub}>
                    {formatMinorCurrency(pkg.suggestedBudgetMinor, pkg.currency)}
                  </Text>
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        style={[styles.primaryBtn, createMutation.isPending && styles.btnDisabled]}
        onPress={() => createMutation.mutate()}
        disabled={
          createMutation.isPending ||
          (target === "post" ? !selectedPostId : !selectedEventId)
        }
      >
        <Text style={styles.primaryBtnText}>{createMutation.isPending ? "Creating…" : "Create draft campaign"}</Text>
      </Pressable>
      {createMutation.isError ? (
        <Text style={styles.errorText}>{(createMutation.error as Error).message}</Text>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your campaigns</Text>
        {campaignsQuery.isLoading ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : (campaignsQuery.data?.items || []).length === 0 ? (
          <Text style={styles.muted}>None yet.</Text>
        ) : (
          (campaignsQuery.data?.items || []).map((c: AdCampaignRow) => (
            <View key={c.id} style={styles.campaignRow}>
              <Text style={styles.campaignTitle}>
                #{c.id} · {c.status} · review {c.review_status || "—"}
              </Text>
              <Text style={styles.muted}>
                {formatMinorCurrency(c.budget_minor, c.currency)}
                {c.boost_funded_at ? " · funded" : " · pay in browser"}
              </Text>
              {!c.boost_funded_at ? (
                <Pressable
                  style={[styles.secondaryBtn, payMutation.isPending && styles.btnDisabled]}
                  onPress={() => openBoostCheckout(c.id)}
                  disabled={payMutation.isPending}
                >
                  <Text style={styles.secondaryBtnText}>{payMutation.isPending ? "Opening…" : "Pay (Stripe)"}</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </View>
      {payMutation.isError ? (
        <Text style={styles.errorText}>{(payMutation.error as Error).message}</Text>
      ) : null}

      <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.secondaryBtnText}>Back to Creator hub</Text>
      </Pressable>
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
    paddingBottom: 32,
    gap: 14
  },
  lede: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text
  },
  muted: {
    color: colors.muted,
    fontSize: 13
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxWidth: "100%"
  },
  chipOn: {
    borderWidth: 0,
    backgroundColor: colors.accentTint
  },
  chipText: {
    fontSize: 12,
    color: colors.text
  },
  chipTextOn: {
    fontWeight: "600",
    color: colors.accentTextOnTint
  },
  chipSub: {
    fontSize: 11,
    color: colors.muted
  },
  primaryBtn: {
    borderRadius: radii.control,
    paddingVertical: 12,
    ...primaryButtonOutline
  },
  primaryBtnText: {
    color: colors.onAccent,
    fontWeight: "600",
    fontSize: 15
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4
  },
  secondaryBtnText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 14
  },
  btnDisabled: {
    opacity: 0.55
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13
  },
  campaignRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 6
  },
  campaignTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text
  }
});
