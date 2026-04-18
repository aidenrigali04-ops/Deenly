import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../../lib/api";
import { fetchSessionMe, signup } from "../../lib/auth";
import { useSessionStore } from "../../store/session-store";
import { authTheme, fonts, primaryButtonOutline, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { ReferralSignupCallout } from "../../components/ReferralSignupCallout";

type Props = NativeStackScreenProps<RootStackParamList, "Signup">;

export function SignupScreen({ navigation, route }: Props) {
  const setUser = useSessionStore((state) => state.setUser);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const referralCode = route.params?.referralCode?.trim();

  const onSubmit = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      await signup({
        email,
        username,
        displayName,
        password,
        ...(referralCode ? { referralCode } : {})
      });
      const me = await fetchSessionMe();
      setUser(me);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to create account";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.panel}>
            <View style={styles.headerBlock}>
              <Text style={styles.heading}>Create account</Text>
              <Text style={styles.subheading}>Join Deenly with email and a public username.</Text>
            </View>

            {referralCode ? <ReferralSignupCallout code={referralCode} /> : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                placeholder="you@example.com"
                placeholderTextColor={authTheme.muted}
                value={email}
                onChangeText={setEmail}
                accessibilityLabel="Email"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
                placeholder="Choose a username"
                placeholderTextColor={authTheme.muted}
                value={username}
                onChangeText={setUsername}
                accessibilityLabel="Username"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Display name</Text>
              <TextInput
                style={styles.input}
                placeholder="How you appear to others"
                placeholderTextColor={authTheme.muted}
                value={displayName}
                onChangeText={setDisplayName}
                accessibilityLabel="Display name"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="At least 8 characters"
                placeholderTextColor={authTheme.muted}
                value={password}
                onChangeText={setPassword}
                accessibilityLabel="Password"
              />
              <Text style={styles.helper}>Must be at least 8 characters.</Text>
            </View>

            {error ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.submit,
                (isSubmitting || pressed) && styles.submitPressed,
                isSubmitting && styles.submitDisabled
              ]}
              disabled={isSubmitting}
              onPress={onSubmit}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              <Text style={styles.submitText}>{isSubmitting ? "Creating account…" : "Create account"}</Text>
            </Pressable>

            <View style={styles.footerRow}>
              <Text style={styles.footerMuted}>Already have an account? </Text>
              <Pressable onPress={() => navigation.navigate("Login")} hitSlop={8}>
                <Text style={styles.footerLink}>Log in</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: authTheme.pageBg
  },
  flex: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24
  },
  panel: {
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
    backgroundColor: authTheme.card,
    borderRadius: authTheme.radiusPanel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: authTheme.border,
    paddingHorizontal: 20,
    paddingVertical: 28,
    ...Platform.select({
      ios: {
        shadowColor: authTheme.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 24
      },
      android: { elevation: 4 }
    })
  },
  headerBlock: {
    alignItems: "center",
    marginBottom: 8
  },
  heading: {
    color: authTheme.text,
    fontFamily: fonts.semiBold,
    fontSize: 28,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: -0.4,
    lineHeight: 34
  },
  subheading: {
    marginTop: 10,
    color: authTheme.muted,
    fontFamily: fonts.regular,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 6
  },
  fieldGroup: {
    marginBottom: 18
  },
  label: {
    color: authTheme.text,
    fontFamily: fonts.medium,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8
  },
  input: {
    height: 48,
    borderRadius: authTheme.radiusControl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: authTheme.border,
    backgroundColor: authTheme.inputSurface,
    paddingHorizontal: 16,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: authTheme.text
  },
  helper: {
    marginTop: 8,
    color: authTheme.muted,
    fontFamily: fonts.regular,
    fontSize: 14
  },
  errorBox: {
    marginBottom: 16,
    borderRadius: authTheme.radiusControl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: authTheme.errorBorder,
    backgroundColor: authTheme.errorBg,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  errorText: {
    color: authTheme.errorText,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20
  },
  submit: {
    marginTop: 8,
    minHeight: 50,
    borderRadius: radii.button,
    ...primaryButtonOutline,
    alignItems: "center",
    justifyContent: "center"
  },
  submitPressed: {
    opacity: 0.92
  },
  submitDisabled: {
    opacity: 0.6
  },
  submitText: {
    color: authTheme.submitText,
    fontFamily: fonts.semiBold,
    fontSize: 15,
    fontWeight: "600"
  },
  footerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 22,
    alignItems: "center"
  },
  footerMuted: {
    color: authTheme.muted,
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlign: "center"
  },
  footerLink: {
    color: authTheme.text,
    fontFamily: fonts.medium,
    fontSize: 14,
    fontWeight: "500",
    textDecorationLine: "underline"
  }
});
