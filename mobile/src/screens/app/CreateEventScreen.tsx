import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PostPublishSuccessOverlay } from "../../components/PostPublishSuccessOverlay";
import { ApiError } from "../../lib/api";
import { createEvent } from "../../lib/events";
import { colors, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "CreateEvent">;

export function CreateEventScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAtInput, setStartsAtInput] = useState("");
  const [addressDisplay, setAddressDisplay] = useState("");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [createdEventId, setCreatedEventId] = useState<number | null>(null);

  const handleEventCelebrationFinish = useCallback(() => {
    setCreatedEventId((id) => {
      if (id != null) {
        navigation.replace("EventDetail", { id });
      }
      return null;
    });
  }, [navigation]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const startsAt = startsAtInput.trim() ? new Date(startsAtInput) : new Date(Date.now() + 60 * 60 * 1000);
      if (Number.isNaN(startsAt.getTime())) {
        throw new Error("Use a valid start date/time");
      }
      return createEvent({
        title: title.trim(),
        description: description.trim() || null,
        startsAt: startsAt.toISOString(),
        addressDisplay: addressDisplay.trim() || null,
        isOnline: Boolean(onlineUrl.trim()),
        onlineUrl: onlineUrl.trim() || null,
        visibility: "public",
        source: "mobile_create"
      });
    },
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-events-near"] });
      setTitle("");
      setDescription("");
      setStartsAtInput("");
      setAddressDisplay("");
      setOnlineUrl("");
      setCreatedEventId(event.id);
    }
  });

  return (
    <View style={styles.wrapper}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Create event</Text>
      <Text style={styles.subtle}>Quick setup for discovery, RSVP, and event chat.</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Title"
          placeholderTextColor={colors.muted}
          value={title}
          onChangeText={setTitle}
          maxLength={180}
        />
        <TextInput
          style={[styles.input, styles.description]}
          placeholder="Description (optional)"
          placeholderTextColor={colors.muted}
          multiline
          value={description}
          onChangeText={setDescription}
          maxLength={4000}
        />
        <TextInput
          style={styles.input}
          placeholder="Starts at (example: 2026-04-18 18:30)"
          placeholderTextColor={colors.muted}
          value={startsAtInput}
          onChangeText={setStartsAtInput}
        />
        <TextInput
          style={styles.input}
          placeholder="Address (optional)"
          placeholderTextColor={colors.muted}
          value={addressDisplay}
          onChangeText={setAddressDisplay}
          maxLength={500}
        />
        <TextInput
          style={styles.input}
          placeholder="Online URL (optional)"
          placeholderTextColor={colors.muted}
          value={onlineUrl}
          onChangeText={setOnlineUrl}
          autoCapitalize="none"
          keyboardType="url"
          maxLength={2000}
        />
        {createMutation.error ? (
          <Text style={styles.error}>
            {createMutation.error instanceof ApiError ? createMutation.error.message : "Could not create event."}
          </Text>
        ) : null}
        <Pressable
          style={[styles.primaryBtn, createMutation.isPending ? styles.primaryBtnDisabled : null]}
          onPress={() => createMutation.mutate()}
          disabled={createMutation.isPending || title.trim().length < 3}
        >
          <Text style={styles.primaryBtnText}>{createMutation.isPending ? "Creating..." : "Create event"}</Text>
        </Pressable>
      </View>
    </ScrollView>
    <PostPublishSuccessOverlay
      visible={createdEventId != null}
      variant="event"
      onFinish={handleEventCelebrationFinish}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 10, paddingBottom: 36 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  subtle: { color: colors.muted, fontSize: 13 },
  card: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 12,
    gap: 10
  },
  input: {
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 10
  },
  description: { minHeight: 96, textAlignVertical: "top" },
  error: { color: colors.danger, fontSize: 12 },
  primaryBtn: {
    borderRadius: radii.control,
    backgroundColor: colors.accent,
    paddingVertical: 11,
    alignItems: "center"
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: colors.onAccent, fontWeight: "700" }
});
