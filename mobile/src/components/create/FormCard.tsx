import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useCreateFlowTheme } from "../ui";

type Props = {
  children: ReactNode;
  style?: ViewStyle;
};

export function FormCard({ children, style }: Props) {
  const t = useCreateFlowTheme();
  return <View style={[t.card, style]}>{children}</View>;
}
