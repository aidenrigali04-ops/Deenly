import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";

export function AdminAnalyticsScreen() {
  const funnelQuery = useQuery({
    queryKey: ["mobile-admin-funnel"],
    queryFn: () => apiRequest("/analytics/dashboard/funnel", { auth: true })
  });
  const retentionQuery = useQuery({
    queryKey: ["mobile-admin-retention"],
    queryFn: () => apiRequest("/analytics/dashboard/retention", { auth: true })
  });
  const feedHealthQuery = useQuery({
    queryKey: ["mobile-admin-feed-health"],
    queryFn: () => apiRequest("/analytics/dashboard/feed-health", { auth: true })
  });

  if (funnelQuery.isLoading || retentionQuery.isLoading || feedHealthQuery.isLoading) {
    return <LoadingState label="Loading admin analytics..." />;
  }
  if (funnelQuery.error || retentionQuery.error || feedHealthQuery.error) {
    return (
      <ErrorState
        message={
          (funnelQuery.error as Error)?.message ||
          (retentionQuery.error as Error)?.message ||
          (feedHealthQuery.error as Error)?.message ||
          "Unable to load analytics"
        }
      />
    );
  }

  const sections = [
    { title: "Activation Funnel", data: funnelQuery.data },
    { title: "Retention", data: retentionQuery.data },
    { title: "Feed Health", data: feedHealthQuery.data }
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Admin Analytics</Text>
      {sections.map((section) => (
        <View key={section.title} style={styles.card}>
          <Text style={styles.title}>{section.title}</Text>
          {section.data ? (
            <Text style={styles.muted}>{JSON.stringify(section.data, null, 2)}</Text>
          ) : (
            <EmptyState title="No analytics data yet." />
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  title: { color: colors.text, fontWeight: "700" },
  muted: { color: colors.muted, fontFamily: "Courier", fontSize: 12 }
});
