import { Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, primaryButtonOutline, radii, secondaryButton } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Welcome">;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Deenly</Text>
      <Text style={styles.title}>Grow with beneficial content and sincere community.</Text>
      <Text style={styles.subtitle}>
        Sign in for Home, Market, Create, Messages, and Profile—with Search from the feed headers when you need it.
      </Text>
      <Pressable style={styles.buttonPrimary} onPress={() => navigation.navigate("Login")}>
        <Text style={styles.buttonPrimaryText}>Login</Text>
      </Pressable>
      <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("Signup")}>
        <Text style={styles.buttonSecondaryText}>Create account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    padding: 20,
    gap: 12
  },
  brand: {
    color: colors.accent,
    fontSize: 34,
    fontWeight: "600",
    letterSpacing: -0.5
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 28
  },
  subtitle: {
    color: colors.muted
  },
  buttonPrimary: {
    borderRadius: radii.button,
    ...primaryButtonOutline
  },
  buttonPrimaryText: {
    color: colors.onAccent,
    fontWeight: "600"
  },
  buttonSecondary: {
    ...secondaryButton
  },
  buttonSecondaryText: {
    color: colors.accentTextOnTint,
    fontWeight: "600"
  }
});
