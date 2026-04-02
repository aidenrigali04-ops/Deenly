import { useEffect, useMemo, useRef } from "react";
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radii } from "../theme";
import { hapticPrimary, hapticTap } from "../lib/haptics";

type Props = {
  visible: boolean;
  title: string;
  priceLabel: string;
  isGuest: boolean;
  guestEmail: string;
  loading: boolean;
  handoffState?: boolean;
  errorMessage?: string;
  onGuestEmailChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function ProductCheckoutSheet({
  visible,
  title,
  priceLabel,
  isGuest,
  guestEmail,
  loading,
  handoffState,
  errorMessage,
  onGuestEmailChange,
  onClose,
  onConfirm
}: Props) {
  const translateY = useRef(new Animated.Value(24)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      translateY.setValue(24);
      fade.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true })
    ]).start();
  }, [fade, translateY, visible]);

  const trimmedGuestEmail = guestEmail.trim();
  const guestEmailLooksValid = useMemo(
    () => trimmedGuestEmail.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedGuestEmail),
    [trimmedGuestEmail]
  );
  const confirmDisabled = loading || (isGuest && !guestEmailLooksValid);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => (loading ? undefined : onClose())}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => (loading ? undefined : onClose())} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            <View style={styles.handle} />
            <Text style={styles.heading}>Secure checkout</Text>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.price}>{priceLabel}</Text>

            <View style={styles.pointRow}>
              <Text style={styles.pointDot}>•</Text>
              <Text style={styles.copy}>Payment completes in Stripe.</Text>
            </View>
            <View style={styles.pointRow}>
              <Text style={styles.pointDot}>•</Text>
              <Text style={styles.copy}>Access details are sent after payment.</Text>
            </View>

            {isGuest ? (
              <View style={styles.guestWrap}>
                <Text style={styles.label}>Email (optional)</Text>
                <TextInput
                  style={[styles.input, !guestEmailLooksValid && styles.inputInvalid]}
                  value={guestEmail}
                  onChangeText={onGuestEmailChange}
                  placeholder="name@email.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholderTextColor={colors.muted}
                />
                <Text style={[styles.helperText, !guestEmailLooksValid && styles.helperTextError]}>
                  {guestEmailLooksValid
                    ? "Add an email to receive receipt and access links."
                    : "Enter a valid email format or clear the field."}
                </Text>
              </View>
            ) : null}

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            <View style={styles.row}>
              <Pressable
                style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && !loading && styles.btnPressed]}
                onPress={() => {
                  void hapticTap();
                  onClose();
                }}
                disabled={loading}
              >
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnPrimary,
                  confirmDisabled && styles.disabled,
                  pressed && !confirmDisabled && styles.btnPressed
                ]}
                onPress={() => {
                  void hapticPrimary();
                  onConfirm();
                }}
                disabled={confirmDisabled}
              >
                <Text style={styles.btnPrimaryText}>
                  {loading ? (handoffState ? "Securely opening..." : "Opening...") : "Continue to Stripe"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.panel,
    borderTopRightRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 8
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    alignSelf: "center",
    marginBottom: 4
  },
  heading: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  title: { fontSize: 18, fontWeight: "600", color: colors.text, letterSpacing: -0.2 },
  price: { fontSize: 16, fontWeight: "600", color: colors.text },
  pointRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  pointDot: { color: colors.muted, fontSize: 15, lineHeight: 20 },
  copy: { fontSize: 14, color: colors.muted, lineHeight: 20, letterSpacing: -0.1 },
  guestWrap: { marginTop: 6, gap: 6 },
  label: { fontSize: 12, fontWeight: "600", color: colors.muted },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.surface
  },
  inputInvalid: {
    borderColor: colors.danger
  },
  helperText: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  helperTextError: { color: colors.danger },
  error: { color: colors.danger, fontSize: 13, marginTop: 4 },
  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  btn: {
    flex: 1,
    borderRadius: radii.control,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  btnGhost: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface
  },
  btnGhostText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  btnPrimary: {
    backgroundColor: colors.accent
  },
  btnPrimaryText: { color: colors.onAccent, fontSize: 15, fontWeight: "600" },
  btnPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 }
});
