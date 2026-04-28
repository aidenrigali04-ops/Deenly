import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { fonts, primaryButtonOutline, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { useAppChrome } from "../../lib/use-app-chrome";

type Props = NativeStackScreenProps<RootStackParamList, "Welcome">;

export function WelcomeScreen({ navigation }: Props) {
  const { figma, figmaHome, mode } = useAppChrome();
  const styles = useMemo(() => buildStyles(figma, figmaHome), [figma, figmaHome]);
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar style={mode === "light" ? "dark" : "light"} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={styles.backgroundOrb} />
      </View>
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

function buildStyles(
  figma: ReturnType<typeof useAppChrome>["figma"],
  figmaHome: ReturnType<typeof useAppChrome>["figmaHome"]
) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: figma.canvas
    },
    backgroundOrb: {
      position: "absolute",
      width: figmaHome.accentOrbSize,
      height: figmaHome.accentOrbSize,
      borderRadius: figmaHome.accentOrbSize / 2,
      backgroundColor: figmaHome.accentOrb,
      top: figmaHome.accentOrbTop,
      left: figmaHome.accentOrbLeft
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
      backgroundColor: figma.card,
      borderRadius: radii.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: figma.glassBorder,
      paddingHorizontal: 22,
      paddingVertical: 28,
      gap: 14
    },
    brand: {
      color: figma.accentGold,
      fontFamily: fonts.semiBold,
      fontSize: 32,
      fontWeight: "600",
      letterSpacing: -0.5,
      textAlign: "center"
    },
    title: {
      color: figma.text,
      fontFamily: fonts.semiBold,
      fontSize: 22,
      fontWeight: "600",
      lineHeight: 28,
      textAlign: "center"
    },
    subtitle: {
      color: figma.textMuted,
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
      color: figma.text,
      fontFamily: fonts.semiBold,
      fontWeight: "600",
      fontSize: 16
    },
    buttonSecondaryWrap: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: figma.glassBorder,
      borderRadius: radii.button,
      backgroundColor: figma.glassSoft,
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center"
    },
    buttonSecondaryText: {
      color: figma.text,
      fontFamily: fonts.semiBold,
      fontWeight: "600",
      fontSize: 15
    }
  });
}
