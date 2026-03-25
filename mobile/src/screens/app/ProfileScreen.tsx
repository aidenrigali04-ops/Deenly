import { useQuery } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fetchSessionMe, logout } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { useSessionStore } from "../../store/session-store";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "AccountTab">,
  NativeStackScreenProps<RootStackParamList>
>;

export function ProfileScreen({ navigation }: Props) {
  const setUser = useSessionStore((state) => state.setUser);
  const adminOwnerEmail = String(process.env.EXPO_PUBLIC_ADMIN_OWNER_EMAIL || "").toLowerCase();
  const sessionQuery = useQuery({
    queryKey: ["mobile-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const interestsQuery = useQuery({
    queryKey: ["mobile-my-interests"],
    queryFn: () => apiRequest<{ items: string[] }>("/users/me/interests", { auth: true })
  });

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  const isOwnerAdmin =
    !!sessionQuery.data &&
    ["admin", "moderator"].includes(sessionQuery.data.role) &&
    String(sessionQuery.data.email || "").toLowerCase() === adminOwnerEmail;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Profile</Text>
      {sessionQuery.isLoading ? <LoadingState label="Loading profile..." /> : null}
      {sessionQuery.error ? <ErrorState message={(sessionQuery.error as Error).message} /> : null}
      {!sessionQuery.isLoading && !sessionQuery.error && !sessionQuery.data ? (
        <EmptyState title="Profile unavailable" />
      ) : null}
      {sessionQuery.data ? (
        <View style={styles.card}>
          <Text style={styles.title}>{sessionQuery.data.email}</Text>
          <Text style={styles.muted}>@{sessionQuery.data.username || "unknown"}</Text>
          <Text style={styles.muted}>Role: {sessionQuery.data.role}</Text>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.title}>Interests</Text>
        <Text style={styles.muted}>
          {(interestsQuery.data?.items || []).join(", ") || "No interests selected"}
        </Text>
        <Pressable
          style={styles.buttonSecondary}
          onPress={() => navigation.navigate("Onboarding")}
        >
          <Text style={styles.buttonText}>Edit interests</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable
          style={styles.buttonSecondary}
          onPress={() => navigation.navigate("Sessions")}
        >
          <Text style={styles.buttonText}>Sessions</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={handleLogout}>
          <Text style={styles.buttonText}>Logout</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("Dhikr")}>
          <Text style={styles.buttonText}>Dhikr</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("QuranReader")}>
          <Text style={styles.buttonText}>Quran</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("SalahSettings")}>
          <Text style={styles.buttonText}>Salah</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("Beta")}>
          <Text style={styles.buttonText}>Beta</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("Support")}>
          <Text style={styles.buttonText}>Support</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("Guidelines")}>
          <Text style={styles.buttonText}>Guidelines</Text>
        </Pressable>
      </View>
      {isOwnerAdmin ? (
        <>
          <View style={styles.row}>
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => navigation.navigate("AdminModeration")}
            >
              <Text style={styles.buttonText}>Admin moderation</Text>
            </Pressable>
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => navigation.navigate("AdminOperations")}
            >
              <Text style={styles.buttonText}>Admin operations</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => navigation.navigate("AdminAnalytics")}
            >
              <Text style={styles.buttonText}>Admin analytics</Text>
            </Pressable>
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => navigation.navigate("AdminTables")}
            >
              <Text style={styles.buttonText}>Admin tables</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 14,
    gap: 12
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700"
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6
  },
  title: {
    color: colors.text,
    fontWeight: "700"
  },
  muted: {
    color: colors.muted
  },
  row: {
    flexDirection: "row",
    gap: 8
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  }
});
