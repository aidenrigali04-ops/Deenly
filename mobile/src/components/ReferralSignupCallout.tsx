import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";
import { useReferralCodePreviewQuery } from "../hooks/use-referral-code-preview";

type Props = {
  code: string;
};

export function ReferralSignupCallout({ code }: Props) {
  const preview = useReferralCodePreviewQuery(code);

  if (preview.isLoading || preview.isFetching) {
    return (
      <View style={[styles.cardMuted, styles.loadingRow]} accessibilityRole="text" accessibilityLabel="Checking invite">
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.mutedSmall}>Checking invite…</Text>
      </View>
    );
  }

  if (preview.isError) {
    return (
      <View style={styles.cardMuted}>
        <Text style={styles.title}>Invite link</Text>
        <Text style={styles.mono}>{code}</Text>
        <Text style={styles.bodyMuted}>
          We could not verify this invite right now. You can still create your account.
        </Text>
      </View>
    );
  }

  const data = preview.data;
  if (!data) {
    return null;
  }

  if (data.valid && data.exhausted) {
    return (
      <View style={styles.cardWarn}>
        <Text style={styles.title}>Invite code</Text>
        <Text style={styles.mono}>{code}</Text>
        <Text style={styles.bodyMuted}>
          This invite has reached its limit. You can still sign up; rewards may not apply from this link.
        </Text>
      </View>
    );
  }

  if (data.valid) {
    return (
      <View style={styles.cardOk}>
        <Text style={styles.title}>You have an invite</Text>
        <Text style={styles.mono}>{code}</Text>
        <Text style={styles.bodyMuted}>
          Finish signing up to connect your account with this referral, subject to program rules.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.cardMuted}>
      <Text style={styles.title}>Invite link</Text>
      <Text style={styles.mono}>{code}</Text>
      <Text style={styles.bodyMuted}>We could not verify this invite code. You can still create your account.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 15, fontWeight: "600", color: colors.text },
  mono: { fontSize: 14, fontFamily: "monospace", color: colors.muted, marginTop: 4 },
  bodyMuted: { fontSize: 14, color: colors.muted, marginTop: 8, lineHeight: 20 },
  mutedSmall: { fontSize: 13, color: colors.muted, marginTop: 8 },
  cardMuted: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    padding: 14,
    gap: 4
  },
  cardWarn: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warning,
    backgroundColor: colors.surfaceTinted,
    padding: 14
  },
  cardOk: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.success,
    backgroundColor: colors.accentTint,
    padding: 14
  }
});
