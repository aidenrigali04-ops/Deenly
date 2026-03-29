import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { colors, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Business = {
  id: number;
  name: string;
  description?: string | null;
  websiteUrl?: string | null;
  addressDisplay?: string | null;
  category?: string | null;
  latitude: number;
  longitude: number;
};

type Props = NativeStackScreenProps<RootStackParamList, "BusinessDetail">;

export function BusinessDetailScreen({ route }: Props) {
  const id = route.params.id;
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["mobile-business", id],
    queryFn: () => apiRequest<Business>(`/businesses/${id}`, { auth: true })
  });

  const chatMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ reply: string }>("/ai/business-chat", {
        method: "POST",
        auth: true,
        body: {
          businessId: id,
          surface: "profile",
          messages: [{ role: "user", content: question.trim() }]
        }
      }),
    onSuccess: (data) => {
      setAnswer(data.reply);
    }
  });

  if (detailQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }
  if (detailQuery.error || !detailQuery.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.err}>Could not load business.</Text>
      </View>
    );
  }

  const b = detailQuery.data;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{b.name}</Text>
      {b.category ? <Text style={styles.meta}>{b.category}</Text> : null}
      {b.addressDisplay ? <Text style={styles.body}>{b.addressDisplay}</Text> : null}
      {b.description ? <Text style={styles.body}>{b.description}</Text> : null}
      {b.websiteUrl ? (
        <Pressable onPress={() => Linking.openURL(b.websiteUrl!)}>
          <Text style={styles.link}>Website</Text>
        </Pressable>
      ) : null}
      <Pressable style={styles.secondary} onPress={() => Linking.openURL(mapsUrl)}>
        <Text style={styles.secondaryText}>Directions</Text>
      </Pressable>
      <Text style={styles.section}>Ask about this business</Text>
      <Text style={styles.hint}>Answers use only the details shown here. For hours or pricing, contact the business.</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={question}
        onChangeText={setQuestion}
        placeholder="Your question"
        multiline
      />
      <Pressable
        style={[styles.primary, (!question.trim() || chatMutation.isPending) && styles.primaryDisabled]}
        disabled={!question.trim() || chatMutation.isPending}
        onPress={() => chatMutation.mutate()}
      >
        <Text style={styles.primaryText}>{chatMutation.isPending ? "Thinking…" : "Ask"}</Text>
      </Pressable>
      {chatMutation.isError ? <Text style={styles.err}>Could not get an answer. Try again.</Text> : null}
      {answer ? <Text style={styles.answer}>{answer}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  meta: { color: colors.muted, fontWeight: "600" },
  body: { color: colors.text, lineHeight: 22 },
  link: { color: colors.accent, fontWeight: "600", textDecorationLine: "underline" },
  section: { marginTop: 16, fontSize: 16, fontWeight: "700", color: colors.text },
  hint: { color: colors.muted, fontSize: 13 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.control,
    padding: 12,
    backgroundColor: colors.card,
    color: colors.text
  },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  secondary: {
    marginTop: 4,
    padding: 12,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center"
  },
  secondaryText: { fontWeight: "600", color: colors.text },
  primary: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: radii.control,
    alignItems: "center"
  },
  primaryDisabled: { opacity: 0.45 },
  primaryText: { color: colors.onAccent, fontWeight: "700" },
  answer: { color: colors.text, lineHeight: 22, marginTop: 8 },
  muted: { color: colors.muted },
  err: { color: colors.danger }
});
