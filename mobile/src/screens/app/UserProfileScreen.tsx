import { useMutation, useQuery } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type UserProfile = {
  user_id: number;
  username?: string;
  display_name: string;
  bio: string | null;
};

type Props = NativeStackScreenProps<RootStackParamList, "UserProfile">;

export function UserProfileScreen({ route }: Props) {
  const userId = route.params.id;
  const profileQuery = useQuery({
    queryKey: ["mobile-user-profile", userId],
    queryFn: () => apiRequest<UserProfile>(`/users/${userId}`)
  });
  const followMutation = useMutation({
    mutationFn: () => apiRequest(`/follows/${userId}`, { method: "POST", auth: true })
  });
  const unfollowMutation = useMutation({
    mutationFn: () => apiRequest(`/follows/${userId}`, { method: "DELETE", auth: true })
  });

  if (profileQuery.isLoading) return <LoadingState label="Loading user profile..." />;
  if (profileQuery.error) return <ErrorState message={(profileQuery.error as Error).message} />;
  if (!profileQuery.data) return <EmptyState title="User not found" />;

  const user = profileQuery.data;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>{user.display_name}</Text>
        <Text style={styles.muted}>@{user.username || "unknown"}</Text>
        <Text style={styles.text}>{user.bio || "No bio yet."}</Text>
        <View style={styles.row}>
          <Pressable style={styles.buttonSecondary} onPress={() => followMutation.mutate()}>
            <Text style={styles.buttonText}>Follow</Text>
          </Pressable>
          <Pressable style={styles.buttonSecondary} onPress={() => unfollowMutation.mutate()}>
            <Text style={styles.buttonText}>Unfollow</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  muted: { color: colors.muted },
  text: { color: colors.text },
  row: { flexDirection: "row", gap: 8 },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  buttonText: { color: colors.text, fontWeight: "600" }
});
