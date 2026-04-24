import { useEffect, useMemo, useRef } from "react";
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, primaryButtonOutline, radii } from "../theme";
import { hapticPrimary, hapticTap } from "../lib/haptics";

type Props = {
  visible: boolean;
  title: string;
  priceLabel: string;
  finalPriceLabel?: string;
  pointsDiscountLabel?: string;
  pointsSpendLabel?: string;
  pointsApplyEnabled?: boolean;
  pointsApplyDisabledReason?: string;
  pointsApplyLoading?: boolean;
  pointsApplyToggle?: boolean;
  isGuest: boolean;
  guestEmail: string;
  loading: boolean;
  handoffState?: boolean;
  checkoutVariant?: "trust_first" | "speed_first";
  errorMessage?: string;
  onGuestEmailChange: (value: string) => void;
  onToggleUsePoints?: (next: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function ProductCheckoutSheet({
  visible,
  title,
  priceLabel,
  finalPriceLabel,
  pointsDiscountLabel,
  pointsSpendLabel,
  pointsApplyEnabled = false,
  pointsApplyDisabledReason,
  pointsApplyLoading = false,
  pointsApplyToggle = false,
  isGuest,
  guestEmail,
  loading,
  handoffState,
  checkoutVariant = "trust_first",
  errorMessage,
  onGuestEmailChange,
  onToggleUsePoints,
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
  const points =
    checkoutVariant === "speed_first"
      ? [
          "Review your item, then pay on Stripe in one short session.",
          "Use card, Apple Pay, or Google Pay when your device supports it.",
          "Access and receipts arrive by email (and SMS when you opt in)."
        ]
      : [
          "You will pay on Stripe; Deenly does not store your card number.",
          "Card, Apple Pay, or Google Pay when available.",
          "After payment, open your email for the secure access link."
        ];

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
            {finalPriceLabel && finalPriceLabel !== priceLabel ? (
              <Text style={styles.finalPrice}>Final after points: {finalPriceLabel}</Text>
            ) : null}
            {pointsDiscountLabel ? <Text style={styles.discountLine}>Points discount: {pointsDiscountLabel}</Text> : null}
            {pointsSpendLabel ? <Text style={styles.discountMeta}>Uses {pointsSpendLabel}</Text> : null}

            <View style={styles.stepsRow}>
              {[
                { n: "1", t: "Review" },
                { n: "2", t: "Pay" },
                { n: "3", t: "Access" }
              ].map((s, i) => (
                <View key={s.n} style={[styles.stepChip, i < 2 && styles.stepChipDivider]}>
                  <Text style={styles.stepNum}>{s.n}</Text>
                  <Text style={styles.stepLabel}>{s.t}</Text>
                </View>
              ))}
            </View>

            {points.map((point) => (
              <View key={point} style={styles.pointRow}>
                <Text style={styles.pointDot}>•</Text>
                <Text style={styles.copy}>{point}</Text>
              </View>
            ))}

            {!isGuest ? (
              <View style={styles.pointsWrap}>
                <Pressable
                  style={({ pressed }) => [
                    styles.pointsToggleBtn,
                    pointsApplyToggle ? styles.pointsToggleBtnOn : null,
                    (pointsApplyLoading || !pointsApplyEnabled) && styles.disabled,
                    pressed && !pointsApplyLoading && pointsApplyEnabled && styles.btnPressed
                  ]}
                  disabled={pointsApplyLoading || !pointsApplyEnabled}
                  onPress={() => onToggleUsePoints?.(!pointsApplyToggle)}
                >
                  <Text style={[styles.pointsToggleText, pointsApplyToggle ? styles.pointsToggleTextOn : null]}>
                    {pointsApplyToggle ? "Using points on this checkout" : "Use points on this checkout"}
                  </Text>
                </Pressable>
                {pointsApplyDisabledReason ? <Text style={styles.helperText}>{pointsApplyDisabledReason}</Text> : null}
              </View>
            ) : null}

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
                  {loading ? (handoffState ? "Opening secure checkout…" : "Opening…") : "Continue to secure checkout"}
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
  finalPrice: { fontSize: 13, color: colors.text, fontWeight: "600", marginTop: 2 },
  discountLine: { fontSize: 12, color: colors.accent, fontWeight: "600", marginTop: 1 },
  discountMeta: { fontSize: 11, color: colors.muted, marginTop: 1 },
  stepsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 4,
    marginBottom: 4,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    overflow: "hidden"
  },
  stepChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.surface
  },
  stepChipDivider: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.borderSubtle
  },
  stepNum: { fontSize: 11, fontWeight: "700", color: colors.muted },
  stepLabel: { fontSize: 11, fontWeight: "600", color: colors.text },
  pointRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  pointDot: { color: colors.muted, fontSize: 15, lineHeight: 20 },
  copy: { fontSize: 14, color: colors.muted, lineHeight: 20, letterSpacing: -0.1 },
  pointsWrap: { marginTop: 8, gap: 5 },
  pointsToggleBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface
  },
  pointsToggleBtnOn: {
    backgroundColor: colors.accentTint,
    borderColor: colors.accent
  },
  pointsToggleText: { color: colors.text, fontWeight: "600", fontSize: 13 },
  pointsToggleTextOn: { color: colors.accentTextOnTint },
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
    ...primaryButtonOutline
  },
  btnPrimaryText: { color: colors.onAccent, fontSize: 15, fontWeight: "600" },
  btnPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 }
});
