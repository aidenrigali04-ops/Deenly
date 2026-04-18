import type React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CreateTabStackParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { useDetachedSceneBottomPadding } from "../../hooks/useTabSceneInsets";
import { figmaMobile, radii, shadows, spacing, type } from "../../theme";
import { hapticTap } from "../../lib/haptics";

type Props = CompositeScreenProps<
  NativeStackScreenProps<CreateTabStackParamList, "CreateHub">,
  NativeStackScreenProps<RootStackParamList>
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
        <Ionicons name={icon} size={20} color={figmaMobile.textMuted} />
      </View>
      <View style={styles.optionText}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={figmaMobile.textMuted2} />
    </Pressable>
  );
}

export function CreateHubScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = useDetachedSceneBottomPadding(32);

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
      <StatusBar style="light" />
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
    backgroundColor: figmaMobile.canvas,
    paddingHorizontal: spacing.pagePaddingH,
    gap: spacing.sectionGap
  },
  title: {
    ...type.pageTitle,
    color: figmaMobile.text
  },
  subtitle: {
    fontSize: 15,
    color: figmaMobile.textMuted,
    lineHeight: 22,
    marginTop: -12
  },
  list: {
    gap: 12
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 88,
    paddingVertical: 16,
    paddingHorizontal: spacing.cardPaddingLg,
    borderRadius: radii.feedCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: figmaMobile.glassBorder,
    backgroundColor: figmaMobile.card,
    gap: 14,
    ...shadows.card
  },
  optionCardPressed: {
    backgroundColor: figmaMobile.glassSoft,
    transform: [{ scale: 0.99 }]
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.control,
    backgroundColor: figmaMobile.glassSoft,
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
    color: figmaMobile.text
  },
  optionDescription: {
    fontSize: 14,
    color: figmaMobile.textMuted,
    lineHeight: 20
  }
});
