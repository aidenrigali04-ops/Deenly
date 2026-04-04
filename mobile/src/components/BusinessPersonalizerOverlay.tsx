import { useState } from "react";
import { ApiError } from "../lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiRequest } from "../lib/api";
import { USAGE_PERSONA_OPTIONS, type UsagePersonaKey } from "../lib/onboarding-options";
import { colors, radii } from "../theme";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { applyMobileMeProfileAfterPreferencesPatch } from "../lib/apply-me-profile-preferences-response";

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function BusinessPersonalizerOverlay({ visible, onDismiss }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const [selectedPersona, setSelectedPersona] = useState<UsagePersonaKey>("personal");
  const [submitError, setSubmitError] = useState("");

  const completeMutation = useMutation({
    mutationFn: async (body: { usagePersona: UsagePersonaKey; navigate?: "CreatorEconomy" | "Onboarding" }) => {
      const me = await apiRequest("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: {
          usagePersona: body.usagePersona,
          preferenceSource: "mobile_overlay"
        }
      });
      return { ...body, me };
    },
    onMutate: () => {
      setSubmitError("");
    },
    onSuccess: async (body) => {
      setSubmitError("");
      await applyMobileMeProfileAfterPreferencesPatch(queryClient, body.me);
      onDismiss();
      if (body.navigate === "CreatorEconomy") {
        navigation.navigate("CreatorEconomy");
      } else if (body.navigate === "Onboarding") {
        navigation.navigate("Onboarding");
      }
    },
    onError: (err: unknown) => {
      setSubmitError(err instanceof ApiError ? err.message : "Could not save. Please try again.");
    }
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => completeMutation.mutate({ usagePersona: "personal", navigate: "Onboarding" })}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Personalize your experience</Text>
          <Text style={styles.sub}>
            Choose what Deenly should optimize first. You can change this later in settings.
          </Text>
          {submitError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {submitError}
            </Text>
          ) : null}
          {USAGE_PERSONA_OPTIONS.map((option) => {
            const active = selectedPersona === option.key;
            return (
              <Pressable
                key={option.key}
                style={[styles.choice, active ? styles.choiceActive : null]}
                disabled={completeMutation.isPending}
                onPress={() => setSelectedPersona(option.key)}
              >
                <Text style={styles.choiceTitle}>{option.label}</Text>
                <Text style={styles.choiceSub}>{option.subtitle}</Text>
              </Pressable>
            );
          })}
          <Pressable
            style={styles.primary}
            disabled={completeMutation.isPending}
            onPress={() =>
              completeMutation.mutate({
                usagePersona: selectedPersona,
                navigate: selectedPersona === "business" ? "CreatorEconomy" : "Onboarding"
              })
            }
          >
            <Text style={styles.primaryText}>{completeMutation.isPending ? "Saving..." : "Continue"}</Text>
          </Pressable>
          <Pressable
            style={styles.ghost}
            disabled={completeMutation.isPending}
            onPress={() => completeMutation.mutate({ usagePersona: "personal", navigate: "Onboarding" })}
          >
            <Text style={styles.ghostText}>I'll decide later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 24
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.panel,
    padding: 20,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  sub: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surface
  },
  choiceActive: {
    borderColor: colors.text,
    backgroundColor: colors.subtleFill
  },
  choiceTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  choiceSub: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radii.control,
    paddingVertical: 12,
    alignItems: "center"
  },
  primaryText: { color: colors.onAccent, fontWeight: "700" },
  ghost: { paddingVertical: 8, alignItems: "center" },
  ghostText: { color: colors.muted, fontWeight: "600" },
  error: { color: "#b91c1c", fontSize: 13, lineHeight: 18 }
});
