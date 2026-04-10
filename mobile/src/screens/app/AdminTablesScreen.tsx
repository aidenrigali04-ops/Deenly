import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";

const TABLES = [
  "users",
  "profiles",
  "posts",
  "interactions",
  "follows",
  "post_views",
  "reports",
  "moderation_actions",
  "user_blocks",
  "user_mutes",
  "analytics_events",
  "refresh_tokens",
  "user_interests",
  "notifications",
  "user_warnings",
  "user_restrictions",
  "appeals",
  "waitlist_entries",
  "beta_invites",
  "support_tickets"
] as const;

type TableResponse = {
  table: string;
  items: Record<string, unknown>[];
};

export function AdminTablesScreen() {
  const [table, setTable] = useState<(typeof TABLES)[number]>("users");
  const [limit, setLimit] = useState("25");

  const query = useQuery({
    queryKey: ["mobile-admin-table", table, limit],
    queryFn: () =>
      apiRequest<TableResponse>(`/admin/tables/${table}?limit=${Number(limit) || 25}&offset=0`, {
        auth: true
      })
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Admin Tables</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Select table</Text>
        <View style={styles.rowWrap}>
          {TABLES.map((tableName) => (
            <Pressable
              key={tableName}
              style={[styles.chip, table === tableName ? styles.chipActive : null]}
              onPress={() => setTable(tableName)}
            >
              <Text style={[styles.chipText, table === tableName ? styles.chipTextActive : null]}>{tableName}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Limit"
          placeholderTextColor={colors.muted}
          value={limit}
          onChangeText={setLimit}
          keyboardType="number-pad"
        />
      </View>
      {query.isLoading ? <LoadingState label="Loading table data..." /> : null}
      {query.error ? <ErrorState message={(query.error as Error).message} /> : null}
      {!query.isLoading && !query.error && (query.data?.items.length || 0) === 0 ? (
        <EmptyState title="No records for this table." />
      ) : null}
      <View style={styles.stack}>
        {query.data?.items.map((item, index) => (
          <View key={`${query.data?.table}-${index}`} style={styles.card}>
            <Text style={styles.muted}>{JSON.stringify(item, null, 2)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  stack: { gap: 10 },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  title: { color: colors.text, fontWeight: "700" },
  muted: { color: colors.muted, fontFamily: "Courier", fontSize: 12 },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  chipActive: {
    backgroundColor: colors.accentTint,
    borderWidth: 0
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700"
  },
  chipTextActive: {
    color: colors.accentTextOnTint
  },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: 10
  }
});
