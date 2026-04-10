import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

const TOKENS = {
  card: "#FFFFFF",
  radius: 16,
  padding: 16,
};

type Props = {
  children: ReactNode;
  style?: ViewStyle;
};

export function FormCard({ children, style }: Props) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.card,
    borderRadius: TOKENS.radius,
    padding: TOKENS.padding,
    gap: 12,
  },
});
