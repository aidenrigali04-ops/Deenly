import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ApiError, apiRequest } from "../lib/api";
import { colors, radii } from "../theme";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { applyMobileMeProfileAfterPreferencesPatch } from "../lib/apply-me-profile-preferences-response";

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

const TOUR_SLIDES: { title: string; body: string }[] = [
  {
    title: "Home and Market",
    body: "Browse posts on Home and discover offers on Market. Switch tabs at the bottom anytime."
  },
  {
    title: "Create",
    body: "Use the Create tab to share a post or reel, list a product or membership, or publish an event."
  },
  {
    title: "Search",
    body: "Tap search on Home or Market to find people, businesses, and events."
  },
  {
    title: "Messages",
    body: "Message people you find in Search. Start new chats from the Messages tab."
  },
  {
    title: "Profile and account type",
    body: "Open Profile for your hub and settings. Switch to Professional or Business there when you want creator or business tools—you can change this anytime."
  }
];

export function BusinessPersonalizerOverlay({ visible, onDismiss }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const [slideIndex, setSlideIndex] = useState(0);
  const [submitError, setSubmitError] = useState("");

  const completeMutation = useMutation({
    mutationFn: async (body: { navigateToOnboarding?: boolean }) => {
      const me = await apiRequest("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: {
          usagePersona: "personal",
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
      setSlideIndex(0);
      await applyMobileMeProfileAfterPreferencesPatch(queryClient, body.me);
      onDismiss();
      if (body.navigateToOnboarding) {
        navigation.navigate("Onboarding");
      }
    },
    onError: (err: unknown) => {
      setSubmitError(err instanceof ApiError ? err.message : "Could not save. Please try again.");
    }
  });

  const last = slideIndex === TOUR_SLIDES.length - 1;
  const slide = TOUR_SLIDES[slideIndex];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => completeMutation.mutate({})}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Welcome to Deenly</Text>
          <Text style={styles.progress}>
            {slideIndex + 1} of {TOUR_SLIDES.length}
          </Text>

          <Text style={styles.slideTitle}>{slide.title}</Text>
          <Text style={styles.slideBody}>{slide.body}</Text>

          <View style={styles.dots}>
            {TOUR_SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === slideIndex ? styles.dotActive : null]} />
            ))}
          </View>

          {submitError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {submitError}
            </Text>
          ) : null}

          <View style={styles.row}>
            {slideIndex > 0 ? (
              <Pressable
                style={styles.secondaryBtn}
                disabled={completeMutation.isPending}
                onPress={() => setSlideIndex((i) => i - 1)}
              >
                <Text style={styles.secondaryBtnText}>Back</Text>
              </Pressable>
            ) : (
              <View style={styles.secondaryBtnPlaceholder} />
            )}
            {!last ? (
              <Pressable
                style={styles.primary}
                disabled={completeMutation.isPending}
                onPress={() => setSlideIndex((i) => i + 1)}
              >
                <Text style={styles.primaryText}>Next</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.primary}
                disabled={completeMutation.isPending}
                onPress={() => completeMutation.mutate({})}
              >
                <Text style={styles.primaryText}>{completeMutation.isPending ? "Saving…" : "Get started"}</Text>
              </Pressable>
            )}
          </View>

          {last ? (
            <Pressable
              style={styles.linkBtn}
              disabled={completeMutation.isPending}
              onPress={() => completeMutation.mutate({ navigateToOnboarding: true })}
            >
              <Text style={styles.linkBtnText}>Customize your feed</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={styles.ghost}
            disabled={completeMutation.isPending}
            onPress={() => completeMutation.mutate({})}
          >
            <Text style={styles.ghostText}>Skip</Text>
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
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  progress: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  slideTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 4 },
  slideBody: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  dots: { flexDirection: "row", gap: 6, marginTop: 8, justifyContent: "center" },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 8,
    height: 8,
    borderRadius: 4
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 88,
    alignItems: "center"
  },
  secondaryBtnPlaceholder: { minWidth: 88 },
  secondaryBtnText: { color: colors.text, fontWeight: "600", fontSize: 15 },
  primary: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radii.control,
    paddingVertical: 12,
    alignItems: "center"
  },
  primaryText: { color: colors.onAccent, fontWeight: "700", fontSize: 15 },
  linkBtn: { paddingVertical: 6, alignItems: "center" },
  linkBtnText: { color: colors.accent, fontWeight: "600", fontSize: 14 },
  ghost: { paddingVertical: 6, alignItems: "center" },
  ghostText: { color: colors.muted, fontWeight: "600", fontSize: 14 },
  error: { color: "#b91c1c", fontSize: 13, lineHeight: 18, textAlign: "center" }
});
