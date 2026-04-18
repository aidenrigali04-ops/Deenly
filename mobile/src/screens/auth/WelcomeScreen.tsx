import { Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { authTheme, fonts, primaryButtonOutline, radii, secondaryButton } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Welcome">;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <View style={styles.center}>
        <View style={styles.panel}>
          <Text style={styles.brand}>Deenly</Text>
          <Text style={styles.title}>Grow with beneficial content and sincere community.</Text>
          <Text style={styles.subtitle}>
            Sign in for Home, Market, Create, Messages, and Profile—with Search from the feed headers when you need it.
          </Text>
          <Pressable style={styles.buttonPrimary} onPress={() => navigation.navigate("Login")}>
            <Text style={styles.buttonPrimaryText}>Log in</Text>
          </Pressable>
          <Pressable style={styles.buttonSecondaryWrap} onPress={() => navigation.navigate("Signup")}>
            <Text style={styles.buttonSecondaryText}>Create account</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: authTheme.pageBg
  },
  center: {
    flex: 1,
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
    paddingHorizontal: 22,
    paddingVertical: 28,
    gap: 14
  },
  brand: {
    color: authTheme.linkAccent,
    fontFamily: fonts.semiBold,
    fontSize: 32,
    fontWeight: "600",
    letterSpacing: -0.5,
    textAlign: "center"
  },
  title: {
    color: authTheme.text,
    fontFamily: fonts.semiBold,
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 28,
    textAlign: "center"
  },
  subtitle: {
    color: authTheme.muted,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  },
  buttonPrimary: {
    marginTop: 6,
    borderRadius: radii.button,
    ...primaryButtonOutline,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50
  },
  buttonPrimaryText: {
    color: authTheme.submitText,
    fontFamily: fonts.semiBold,
    fontWeight: "600",
    fontSize: 16
  },
  buttonSecondaryWrap: {
    ...secondaryButton,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonSecondaryText: {
    color: authTheme.linkAccent,
    fontFamily: fonts.semiBold,
    fontWeight: "600",
    fontSize: 15
  }
});
