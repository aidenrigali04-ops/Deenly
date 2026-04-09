import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, radii, shadows, spacing } from "../../theme";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "NavigateApp">;

type TabName = "HomeTab" | "MarketplaceTab" | "MessagesTab" | "CreateTab" | "AccountTab";

const ROWS: ({ tab: TabName; title: string; subtitle: string } | { stack: "Search"; title: string; subtitle: string })[] = [
  { tab: "HomeTab", title: "Home", subtitle: "Main feed" },
  { tab: "MarketplaceTab", title: "Market", subtitle: "Browse listings" },
  { stack: "Search", title: "Explore", subtitle: "People, posts, and near me" },
  { tab: "MessagesTab", title: "Messages", subtitle: "Direct messages" },
  { tab: "CreateTab", title: "Create", subtitle: "Post, product, or event" },
  { tab: "AccountTab", title: "Profile", subtitle: "Your grid and products" }
];

export function NavigateAppScreen({ navigation }: Props) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.lede}>Same destinations as the tab bar—useful when you are deep in a screen.</Text>
      <View style={[styles.card, shadows.card]}>
        {ROWS.map((row, index) => (
          <Pressable
            key={"stack" in row ? row.stack : row.tab}
            onPress={() => {
              if ("stack" in row) {
                navigation.navigate(row.stack);
                return;
              }
              navigation.navigate(
                "AppTabs",
                { screen: row.tab } as NavigatorScreenParams<AppTabParamList>
              );
            }}
            style={({ pressed }) => [
              styles.row,
              index < ROWS.length - 1 && styles.rowBorder,
              pressed && styles.rowPressed
            ]}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
            </View>
            <Text style={styles.chevron}>→</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 12,
    paddingBottom: spacing.screenBottom,
    gap: 14
  },
  lede: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 21,
    marginBottom: 2,
    letterSpacing: -0.2
  },
  card: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    overflow: "hidden"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 18,
    minHeight: 54
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  rowPressed: { backgroundColor: colors.subtleFill },
  rowText: { flex: 1, paddingRight: 14, gap: 3 },
  rowTitle: { fontSize: 16, fontWeight: "500", color: colors.text, letterSpacing: -0.2 },
  rowSubtitle: { fontSize: 13, color: colors.muted, lineHeight: 18, letterSpacing: -0.1 },
  chevron: { fontSize: 15, color: colors.muted, fontWeight: "400" }
});
