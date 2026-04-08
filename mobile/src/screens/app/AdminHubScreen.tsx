import { ScrollView, StyleSheet, Text } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SettingsRow, SettingsSection } from "../../components/SettingsSection";
import { colors } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "AdminHub">;

export function AdminHubScreen({ navigation }: Props) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>Internal tools for your authorized admin account.</Text>
      <SettingsSection title="Admin">
        <SettingsRow title="Moderation" onPress={() => navigation.navigate("AdminModeration")} />
        <SettingsRow title="Operations" onPress={() => navigation.navigate("AdminOperations")} />
        <SettingsRow title="Analytics" onPress={() => navigation.navigate("AdminAnalytics")} />
        <SettingsRow title="Data tables" subtitle="Browse admin tables" onPress={() => navigation.navigate("AdminTables")} />
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32, gap: 20 },
  lead: { fontSize: 14, color: colors.muted, marginBottom: 4 }
});
