import { useState } from "react";
import {
  Alert,
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
import Svg, { Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../../lib/api";
import { fetchSessionMe, login } from "../../lib/auth";
import { useSessionStore } from "../../store/session-store";
import { authTheme, primaryButtonOutline } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 262" accessibilityRole="image">
      <Path
        fill="#4285F4"
        d="M255.878 133.451c0-10.47-.936-20.53-2.677-30.187H130.55v57.147h70.067c-3.02 16.303-12.208 30.104-26.032 39.315v32.623h42.059c24.63-22.68 39.234-56.147 39.234-98.898z"
      />
      <Path
        fill="#34A853"
        d="M130.55 261.1c35.325 0 64.96-11.712 86.613-31.752l-42.06-32.623c-11.71 7.85-26.662 12.48-44.553 12.48-34.2 0-63.17-23.1-73.53-54.13H13.7v33.998C35.23 232.1 79.04 261.1 130.55 261.1z"
      />
      <Path
        fill="#FBBC05"
        d="M57.02 155.076a78.8 78.8 0 0 1-4.1-25.076c0-8.71 1.5-17.18 4.1-25.076V70.927H13.7a130.12 130.12 0 0 0 0 118.146l43.32-33.997z"
      />
      <Path
        fill="#EA4335"
        d="M130.55 50.795c19.21 0 36.47 6.6 50.04 19.56l37.53-37.53C195.46 11.72 165.87 0 130.55 0 79.04 0 35.23 29 13.7 70.927l43.32 33.997c10.36-31.03 39.33-54.13 73.53-54.13z"
      />
    </Svg>
  );
}

export function LoginScreen({ navigation }: Props) {
  const setUser = useSessionStore((state) => state.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onGooglePress = () => {
    Alert.alert(
      "Google sign-in",
      "Google sign-in is not available in the mobile app yet. Please use email and password, or sign in on the web.",
      [{ text: "OK" }]
    );
  };

  const onSubmit = async () => {
    setError("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setIsSubmitting(true);
    try {
      await login({ email: trimmedEmail, password });
      const me = await fetchSessionMe();
      setUser(me);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to login";
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
              <Text style={styles.heading}>Log In Account</Text>
              <Text style={styles.subheading}>Welcome back. Enter your credentials to continue.</Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.googleBtn, pressed && styles.googleBtnPressed]}
              onPress={onGooglePress}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
            >
              <GoogleMark />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Or</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                placeholder="eg. johnfrans@gmail.com"
                placeholderTextColor={authTheme.muted}
                value={email}
                onChangeText={setEmail}
                accessibilityLabel="Email"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                placeholder="Enter your password"
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
              accessibilityLabel="Log in"
            >
              <Text style={styles.submitText}>{isSubmitting ? "Signing In..." : "Log In"}</Text>
            </Pressable>

            <View style={styles.footerRow}>
              <Text style={styles.footerMuted}>{"Don't have an account? "}</Text>
              <Pressable onPress={() => navigation.navigate("Signup")} hitSlop={8}>
                <Text style={styles.footerLink}>Sign Up</Text>
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
    alignItems: "center"
  },
  heading: {
    color: authTheme.text,
    fontSize: 34,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 40
  },
  subheading: {
    marginTop: 12,
    color: authTheme.muted,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8
  },
  googleBtn: {
    marginTop: 28,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderRadius: authTheme.radiusControl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: authTheme.border,
    backgroundColor: authTheme.card
  },
  googleBtnPressed: {
    backgroundColor: "rgba(0, 0, 0, 0.03)"
  },
  googleBtnText: {
    color: authTheme.text,
    fontSize: 14,
    fontWeight: "500"
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginVertical: 24
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: authTheme.border
  },
  dividerText: {
    color: authTheme.muted,
    fontSize: 14
  },
  fieldGroup: {
    marginBottom: 20
  },
  label: {
    color: authTheme.text,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8
  },
  input: {
    height: 48,
    borderRadius: authTheme.radiusControl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: authTheme.border,
    backgroundColor: authTheme.card,
    paddingHorizontal: 16,
    fontSize: 14,
    color: authTheme.text
  },
  helper: {
    marginTop: 8,
    color: authTheme.muted,
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
    fontSize: 14,
    lineHeight: 20
  },
  submit: {
    marginTop: 12,
    height: 48,
    borderRadius: authTheme.radiusControl,
    ...primaryButtonOutline
  },
  submitPressed: {
    opacity: 0.92
  },
  submitDisabled: {
    opacity: 0.6
  },
  submitText: {
    color: authTheme.submitText,
    fontSize: 15,
    fontWeight: "700"
  },
  footerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 24,
    alignItems: "center"
  },
  footerMuted: {
    color: authTheme.muted,
    fontSize: 14,
    textAlign: "center"
  },
  footerLink: {
    color: authTheme.text,
    fontSize: 14,
    fontWeight: "500",
    textDecorationLine: "underline"
  }
});
