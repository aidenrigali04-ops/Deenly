import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiRequest } from "../lib/api";
import { colors, radii } from "../theme";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function BusinessPersonalizerOverlay({ visible, onDismiss }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();

  const completeMutation = useMutation({
    mutationFn: (body: {
      step: number;
      profileKind: "consumer" | "business_interest";
      navigate?: "AddBusiness" | "CreatorEconomy";
    }) =>
      apiRequest("/users/me/preferences", {
        method: "PATCH",
        auth: true,
        body: {
          businessOnboardingDismissed: true,
          businessOnboardingStep: body.step,
          profileKind: body.profileKind
        }
      }).then(() => body),
    onSuccess: async (body) => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-user-me-onboarding"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-account-profile"] });
      onDismiss();
      if (body.navigate === "AddBusiness") {
        navigation.navigate("AddBusiness");
      } else if (body.navigate === "CreatorEconomy") {
        navigation.navigate("CreatorEconomy");
      }
    }
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => completeMutation.mutate({ step: 0, profileKind: "consumer" })}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Personalize your experience</Text>
          <Text style={styles.sub}>
            List on the map or connect payments when you&apos;re ready — or skip and stay personal.
          </Text>
          <Pressable
            style={styles.primary}
            disabled={completeMutation.isPending}
            onPress={() =>
              completeMutation.mutate({ step: 1, profileKind: "business_interest", navigate: "AddBusiness" })
            }
          >
            <Text style={styles.primaryText}>Add business to map</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            disabled={completeMutation.isPending}
            onPress={() =>
              completeMutation.mutate({ step: 2, profileKind: "business_interest", navigate: "CreatorEconomy" })
            }
          >
            <Text style={styles.secondaryText}>Stripe & selling</Text>
          </Pressable>
          <Pressable
            style={styles.ghost}
            disabled={completeMutation.isPending}
            onPress={() => completeMutation.mutate({ step: 0, profileKind: "consumer" })}
          >
            <Text style={styles.ghostText}>{completeMutation.isPending ? "Saving…" : "Skip for now"}</Text>
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
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radii.control,
    paddingVertical: 12,
    alignItems: "center"
  },
  primaryText: { color: colors.onAccent, fontWeight: "700" },
  secondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.surface
  },
  secondaryText: { color: colors.text, fontWeight: "600" },
  ghost: { paddingVertical: 8, alignItems: "center" },
  ghostText: { color: colors.muted, fontWeight: "600" }
});
