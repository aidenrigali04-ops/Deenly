import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../lib/api";
import { colors } from "../../theme";

export function BetaScreen() {
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState("");

  const waitlistMutation = useMutation({
    mutationFn: () =>
      apiRequest("/beta/waitlist", {
        method: "POST",
        body: {
          email: waitlistEmail,
          source: "mobile",
          note: "mobile-beta"
        }
      })
  });

  const redeemMutation = useMutation({
    mutationFn: () =>
      apiRequest("/beta/invite/redeem", {
        method: "POST",
        auth: true,
        body: {
          code: inviteCode
        }
      })
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Private Beta</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Join waitlist</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          value={waitlistEmail}
          onChangeText={setWaitlistEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Pressable
          style={styles.buttonSecondary}
          onPress={async () => {
            try {
              await waitlistMutation.mutateAsync();
              setMessage("Added to waitlist.");
            } catch (error) {
              setMessage(error instanceof ApiError ? error.message : "Unable to join waitlist.");
            }
          }}
        >
          <Text style={styles.buttonText}>
            {waitlistMutation.isPending ? "Submitting..." : "Join waitlist"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Redeem invite</Text>
        <TextInput
          style={styles.input}
          placeholder="Invite code"
          placeholderTextColor={colors.muted}
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="none"
        />
        <Pressable
          style={styles.buttonSecondary}
          onPress={async () => {
            try {
              await redeemMutation.mutateAsync();
              setMessage("Invite redeemed.");
            } catch (error) {
              setMessage(error instanceof ApiError ? error.message : "Unable to redeem invite.");
            }
          }}
        >
          <Text style={styles.buttonText}>
            {redeemMutation.isPending ? "Redeeming..." : "Redeem"}
          </Text>
        </Pressable>
      </View>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  title: { color: colors.text, fontWeight: "700" },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: 10
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start"
  },
  buttonText: { color: colors.text, fontWeight: "600" },
  muted: { color: colors.muted }
});
