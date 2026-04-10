import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { applyMobileMeProfileAfterPreferencesPatch } from "../../lib/apply-me-profile-preferences-response";
import { colors, primaryButtonOutline, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";
// Metro cannot bundle `../shared/` from this app — use `lib/onboarding-options` (mirror of repo `shared/`).
import {
  APP_LANDING_OPTIONS,
  FEED_TAB_OPTIONS,
  INTEREST_OPTIONS,
  INTENT_OPTIONS
} from "../../lib/onboarding-options";

type InterestsResponse = { items: string[] };
type MeProfile = {
  onboarding_intents?: string[] | null;
  default_feed_tab?: string | null;
  app_landing?: string | null;
};

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

export function OnboardingScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [intents, setIntents] = useState<string[]>([]);
  const [defaultFeedTab, setDefaultFeedTab] = useState("for_you");
  const [appLanding, setAppLanding] = useState("home");
  const [message, setMessage] = useState("");

  const interestsQuery = useQuery({
    queryKey: ["mobile-interests"],
    queryFn: () => apiRequest<InterestsResponse>("/users/me/interests", { auth: true })
  });

  const meQuery = useQuery({
    queryKey: ["mobile-account-profile"],
    queryFn: () => apiRequest<MeProfile>("/users/me", { auth: true })
  });

  useEffect(() => {
    if (interestsQuery.data?.items?.length) {
      setSelectedInterests(interestsQuery.data.items);
    }
  }, [interestsQuery.data]);

  useEffect(() => {
    if (!meQuery.data) {
      return;
    }
    const oi = meQuery.data.onboarding_intents;
    if (oi && oi.length) {
      setIntents(oi);
    }
    if (meQuery.data.default_feed_tab) {
      setDefaultFeedTab(meQuery.data.default_feed_tab);
    }
    if (meQuery.data.app_landing) {
      setAppLanding(meQuery.data.app_landing);
    }
  }, [meQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/users/me/interests", {
        method: "PUT",
        auth: true,
        body: { interests: selectedInterests }
      });
      return apiRequest("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: {
          onboardingIntents: intents,
          defaultFeedTab: defaultFeedTab || null,
          appLanding: appLanding || null,
          businessOnboardingDismissed: true,
          preferenceSource: "mobile_onboarding"
        }
      });
    },
    onSuccess: async (me) => {
      setMessage("Saved to your account.");
      await applyMobileMeProfileAfterPreferencesPatch(queryClient, me);
      await queryClient.invalidateQueries({ queryKey: ["mobile-interests"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-my-interests"] });
    },
    onError: (e: Error) => {
      setMessage(e.message || "Could not save.");
    }
  });

  if (interestsQuery.isLoading || meQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.heading}>Setup</Text>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (interestsQuery.error || meQuery.error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.heading}>Setup</Text>
        <Text style={styles.muted}>Could not load preferences. Check your connection and try again.</Text>
      </View>
    );
  }

  const activeInterests = selectedInterests.length ? selectedInterests : interestsQuery.data?.items || [];

  const toggleIntent = (key: string) => {
    setIntents((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, key];
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Your Deenly setup</Text>
      <Text style={styles.muted}>Saved to your account. Reopen anytime from Profile (Setup & feed).</Text>

      <Text style={styles.sectionTitle}>Feed interests</Text>
      <Text style={styles.hint}>Used to personalize ranking in For You.</Text>
      {INTEREST_OPTIONS.map((option) => {
        const checked = activeInterests.includes(option.key);
        return (
          <Pressable
            key={option.key}
            style={styles.checkRow}
            onPress={() => {
              if (checked) {
                setSelectedInterests(activeInterests.filter((item) => item !== option.key));
              } else {
                setSelectedInterests([...new Set([...activeInterests, option.key])]);
              }
            }}
          >
            <Text style={styles.checkMark}>{checked ? "☑" : "☐"}</Text>
            <Text style={styles.checkLabel}>{option.label}</Text>
          </Pressable>
        );
      })}

      <Text style={[styles.sectionTitle, styles.sectionSpacer]}>What brings you here? (up to 3)</Text>
      <Text style={styles.hint}>Optional — helps focus the experience.</Text>
      <View style={styles.rowWrap}>
        {INTENT_OPTIONS.map((option) => {
          const on = intents.includes(option.key);
          const disabled = !on && intents.length >= 3;
          return (
            <Pressable
              key={option.key}
              style={[styles.chip, on ? styles.chipActive : null, disabled ? styles.chipDisabled : null]}
              disabled={disabled}
              onPress={() => toggleIntent(option.key)}
            >
              <Text style={[styles.chipText, on ? styles.chipTextActive : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Default tab on Home</Text>
      <View style={styles.rowWrap}>
        {FEED_TAB_OPTIONS.map((opt) => {
          const on = defaultFeedTab === opt.key;
          return (
            <Pressable
              key={opt.key}
              style={[styles.chip, on ? styles.chipActive : null]}
              onPress={() => setDefaultFeedTab(opt.key)}
            >
              <Text style={[styles.chipText, on ? styles.chipTextActive : null]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Open app to</Text>
      <View style={styles.rowWrap}>
        {APP_LANDING_OPTIONS.map((opt) => {
          const on = appLanding === opt.key;
          return (
            <Pressable
              key={opt.key}
              style={[styles.chip, on ? styles.chipActive : null]}
              onPress={() => setAppLanding(opt.key)}
            >
              <Text style={[styles.chipText, on ? styles.chipTextActive : null]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={styles.button}
        onPress={() => {
          setMessage("");
          saveMutation.mutate();
        }}
        disabled={saveMutation.isPending}
      >
        <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving…" : "Save to account"}</Text>
      </Pressable>

      <Pressable style={styles.linkBack} onPress={() => navigation.goBack()}>
        <Text style={styles.linkBackText}>Back</Text>
      </Pressable>

      {message ? <Text style={styles.message}>{message}</Text> : null}
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
    paddingBottom: 40,
    gap: 8
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
    justifyContent: "center"
  },
  heading: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700"
  },
  sectionTitle: {
    marginTop: 8,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700"
  },
  sectionSpacer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 4
  },
  muted: { color: colors.muted, marginTop: 6 },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8
  },
  checkMark: {
    fontSize: 18,
    color: colors.text
  },
  checkLabel: {
    color: colors.text,
    fontSize: 15,
    flex: 1
  },
  rowWrap: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  chipActive: {
    backgroundColor: colors.accentTint,
    borderWidth: 0
  },
  chipDisabled: {
    opacity: 0.45
  },
  chipText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 13
  },
  chipTextActive: {
    color: colors.accentTextOnTint
  },
  button: {
    marginTop: 20,
    borderRadius: radii.control,
    paddingVertical: 14,
    ...primaryButtonOutline
  },
  buttonText: {
    color: colors.onAccent,
    fontWeight: "600",
    fontSize: 16
  },
  linkBack: {
    marginTop: 12,
    alignSelf: "center",
    padding: 8
  },
  linkBackText: {
    color: colors.muted,
    fontWeight: "600"
  },
  message: {
    marginTop: 8,
    color: colors.accent,
    fontSize: 14,
    textAlign: "center"
  }
});
