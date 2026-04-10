import type React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppTabParamList, CreateTabStackParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { useTabSceneBottomPadding } from "../../hooks/useTabSceneInsets";
import { colors, radii, spacing, type } from "../../theme";
import { hapticTap } from "../../lib/haptics";

type Props = CompositeScreenProps<
  NativeStackScreenProps<CreateTabStackParamList, "CreateHub">,
  CompositeScreenProps<BottomTabScreenProps<AppTabParamList, "CreateTab">, NativeStackScreenProps<RootStackParamList>>
>;

type OptionRowProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  description: string;
  onPress: () => void;
};

function OptionRow({ icon, title, description, onPress }: OptionRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.optionCard, pressed && styles.optionCardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={22} color={colors.accent} />
      </View>
      <View style={styles.optionText}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.mutedLight} />
    </Pressable>
  );
}

export function CreateHubScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = useTabSceneBottomPadding(24);

  const goPost = () => {
    void hapticTap();
    navigation.navigate("CreatePost");
  };
  const goProduct = () => {
    void hapticTap();
    navigation.navigate("CreateProduct");
  };
  const goEvent = () => {
    void hapticTap();
    navigation.navigate("CreateEvent");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.pagePaddingTop, paddingBottom: bottomPad }]}>
      <Text style={styles.title}>Create</Text>
      <Text style={styles.subtitle}>Share, sell, or gather your community in one place.</Text>

      <View style={styles.list}>
        <OptionRow
          icon="images-outline"
          title="Post or Reel"
          description="Share content with your audience."
          onPress={goPost}
        />
        <OptionRow
          icon="bag-outline"
          title="Product"
          description="Sell a product, service, or offer."
          onPress={goProduct}
        />
        <OptionRow
          icon="calendar-outline"
          title="Event"
          description="Create a gathering, meetup, or session."
          onPress={goEvent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.atmosphere,
    paddingHorizontal: spacing.pagePaddingH,
    gap: spacing.sectionGap
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.6
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
    marginTop: -12
  },
  list: {
    gap: 12
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 92,
    paddingVertical: 16,
    paddingHorizontal: spacing.cardPadding,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 14
  },
  optionCardPressed: {
    backgroundColor: colors.accentMuted,
    transform: [{ scale: 0.98 }]
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.control,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  optionTitle: {
    ...type.cardTitle,
    color: colors.text
  },
  optionDescription: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20
  }
});
