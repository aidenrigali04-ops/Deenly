import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCreateFlowTheme } from "../ui";

type Props = {
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
};

export function StickyCtaBar({
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  secondaryLabel,
  onSecondary,
  secondaryDisabled
}: Props) {
  const insets = useSafeAreaInsets();
  const t = useCreateFlowTheme();
  const disabled = primaryDisabled || primaryLoading;

  return (
    <View style={[t.stickyBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
      <Pressable
        onPress={onPrimary}
        disabled={disabled}
        style={({ pressed }) => [
          t.primaryCta,
          disabled && t.primaryCtaDisabled,
          pressed && !disabled && { opacity: 0.92, transform: [{ scale: 0.998 }] }
        ]}
      >
        {primaryLoading ? (
          <ActivityIndicator color="#0A0A0B" />
        ) : (
          <Text style={t.primaryCtaLabel}>{primaryLabel}</Text>
        )}
      </Pressable>
      {secondaryLabel && onSecondary ? (
        <Pressable
          onPress={onSecondary}
          disabled={secondaryDisabled}
          style={({ pressed }) => [t.secondaryCta, secondaryDisabled && { opacity: 0.45 }, pressed && { opacity: 0.75 }]}
        >
          <Text style={t.secondaryCtaLabel}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
