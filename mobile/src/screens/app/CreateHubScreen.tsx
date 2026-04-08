import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppTabParamList, CreateTabStackParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { useTabSceneBottomPadding } from "../../hooks/useTabSceneInsets";
import { colors, radii, shadows } from "../../theme";
import { hapticTap } from "../../lib/haptics";

type Props = CompositeScreenProps<
  NativeStackScreenProps<CreateTabStackParamList, "CreateHub">,
  CompositeScreenProps<BottomTabScreenProps<AppTabParamList, "CreateTab">, NativeStackScreenProps<RootStackParamList>>
>;

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
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: bottomPad }]}>
      <Text style={styles.title}>Create</Text>
      <Text style={styles.subtitle}>Choose what you want to add. You can always switch later.</Text>

      <View style={styles.grid}>
        <Pressable
          style={({ pressed }) => [styles.tile, shadows.card, pressed && styles.tilePressed]}
          onPress={goPost}
          accessibilityRole="button"
          accessibilityLabel="New post or reel"
        >
          <Text style={styles.tileTitle}>Post or reel</Text>
          <Text style={styles.tileSub}>Photo, video, and caption</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.tile, shadows.card, pressed && styles.tilePressed]}
          onPress={goProduct}
          accessibilityRole="button"
          accessibilityLabel="New product or offering"
        >
          <Text style={styles.tileTitle}>Product</Text>
          <Text style={styles.tileSub}>Digital, service, or membership</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.tile, shadows.card, pressed && styles.tilePressed]}
          onPress={goEvent}
          accessibilityRole="button"
          accessibilityLabel="New event"
        >
          <Text style={styles.tileTitle}>Event</Text>
          <Text style={styles.tileSub}>Meetup or session</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.atmosphere,
    paddingHorizontal: 20,
    gap: 10
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
    marginBottom: 8
  },
  grid: {
    gap: 12,
    marginTop: 4
  },
  tile: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 6
  },
  tilePressed: {
    opacity: 0.92
  },
  tileTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.2
  },
  tileSub: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20
  }
});
