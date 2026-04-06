import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { colors, radii } from "../theme";

type UserResult = {
  user_id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type Props = {
  onSelectUser: (userId: number) => void;
  isPending?: boolean;
};

export function UserSearchInput({ onSelectUser, isPending }: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery) setOpen(true);
    else setOpen(false);
  }, [debouncedQuery]);

  const searchQuery = useQuery({
    queryKey: ["mobile-user-search", debouncedQuery],
    queryFn: () =>
      apiRequest<{ items: UserResult[] }>(
        `/search/users?q=${encodeURIComponent(debouncedQuery)}&limit=8`
      ),
    enabled: debouncedQuery.length >= 1,
  });

  const results = searchQuery.data?.items || [];

  return (
    <View style={styles.wrapper}>
      <TextInput
        style={styles.input}
        placeholder="Search people to message..."
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={setQuery}
        onFocus={() => { if (debouncedQuery) setOpen(true); }}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {open && debouncedQuery.length > 0 && (
        <View style={styles.dropdown}>
          {searchQuery.isLoading && (
            <Text style={styles.hint}>Searching...</Text>
          )}
          {!searchQuery.isLoading && results.length === 0 && (
            <Text style={styles.hint}>No users found</Text>
          )}
          <FlatList
            data={results}
            keyExtractor={(item) => String(item.user_id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const initials = item.display_name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("") || "U";
              return (
                <Pressable
                  style={styles.resultItem}
                  disabled={isPending}
                  onPress={() => {
                    onSelectUser(item.user_id);
                    setQuery("");
                    setDebouncedQuery("");
                    setOpen(false);
                  }}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                  <View style={styles.resultText}>
                    <Text style={styles.displayName} numberOfLines={1}>{item.display_name}</Text>
                    <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    zIndex: 10,
  },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.control,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: 10,
  },
  dropdown: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.control,
    marginTop: 4,
    maxHeight: 240,
    overflow: "hidden",
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  resultText: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  username: {
    color: colors.muted,
    fontSize: 12,
  },
});
