import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { colors } from "../../theme";

export function BoostCheckoutReturnScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "BoostCheckoutReturn">>();
  const queryClient = useQueryClient();
  const step = route.params?.step;

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["mobile-ads-campaigns-me"] });
    const id = requestAnimationFrame(() => {
      navigation.replace("PromotePost");
    });
    return () => cancelAnimationFrame(id);
  }, [navigation, queryClient]);

  const title = step === "cancel" ? "Checkout canceled" : "Payment submitted";
  const subtitle =
    step === "cancel"
      ? "You can try again from Promote in feed when you are ready."
      : "Stripe may take a moment to confirm. Refreshing your campaigns…";

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{subtitle}</Text>
      <ActivityIndicator style={styles.spinner} color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: colors.background
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text
  },
  sub: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted
  },
  spinner: {
    marginTop: 20
  }
});
