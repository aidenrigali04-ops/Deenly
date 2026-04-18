import type React from "react";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CreateTabStackParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { useDetachedSceneBottomPadding } from "../../hooks/useTabSceneInsets";
import { radii, resolveFigmaMobile, shadows, spacing, type } from "../../theme";
import { useAppChrome } from "../../lib/use-app-chrome";
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
  iconMuted: string;
  chevronMuted: string;
  styles: ReturnType<typeof buildCreateHubStyles>;
};

function OptionRow({ icon, title, description, onPress, iconMuted, chevronMuted, styles }: OptionRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.optionCard, pressed && styles.optionCardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={20} color={iconMuted} />
      </View>
      <View style={styles.optionText}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={chevronMuted} />
    </Pressable>
  );
}

function buildCreateHubStyles(fig: ReturnType<typeof resolveFigmaMobile>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: fig.canvas,
      paddingHorizontal: spacing.pagePaddingH,
      gap: spacing.sectionGap
    },
    title: {
      ...type.pageTitle,
      color: fig.text
    },
    subtitle: {
      fontSize: 15,
      color: fig.textMuted,
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
      borderColor: fig.glassBorder,
      backgroundColor: fig.card,
      gap: 14,
      ...shadows.card
    },
    optionCardPressed: {
      backgroundColor: fig.glassSoft,
      transform: [{ scale: 0.99 }]
    },
    iconBox: {
      width: 36,
      height: 36,
      borderRadius: radii.control,
      backgroundColor: fig.glassSoft,
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
      color: fig.text
    },
    optionDescription: {
      fontSize: 14,
      color: fig.textMuted,
      lineHeight: 20
    }
  });
}

export function CreateHubScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = useDetachedSceneBottomPadding(32);
  const { figma, mode } = useAppChrome();
  const styles = useMemo(() => buildCreateHubStyles(figma), [figma]);

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
      <StatusBar style={mode === "light" ? "dark" : "light"} />
      <Text style={styles.title}>Create</Text>
      <Text style={styles.subtitle}>Start something new — post to your feed, list an offer, or host an event.</Text>

      <View style={styles.list}>
        <OptionRow
          icon="images-outline"
          title="Post or Reel"
          description="Write a caption, upload photos or a video, then publish."
          onPress={goPost}
          iconMuted={figma.textMuted}
          chevronMuted={figma.textMuted2}
          styles={styles}
        />
        <OptionRow
          icon="bag-outline"
          title="Product listing"
          description="Set price and checkout — for digital goods or services."
          onPress={goProduct}
          iconMuted={figma.textMuted}
          chevronMuted={figma.textMuted2}
          styles={styles}
        />
        <OptionRow
          icon="calendar-outline"
          title="Event"
          description="Time, place, and RSVP — for classes, meetups, or gatherings."
          onPress={goEvent}
          iconMuted={figma.textMuted}
          chevronMuted={figma.textMuted2}
          styles={styles}
        />
      </View>
    </View>
  );
}
