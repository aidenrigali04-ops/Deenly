import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PostPublishSuccessOverlay } from "../../components/PostPublishSuccessOverlay";
import { ApiError } from "../../lib/api";
import { assistPostText } from "../../lib/ai-assist";
import { parseEventStartsAtInput } from "../../lib/event-starts-at";
import { createEvent } from "../../lib/events";
import { colors } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import {
  FormCard,
  SoftTextInput,
  SoftTextArea,
  StickyCtaBar,
  UploadCard,
  SubtypeSegmentedControl,
  AIHelperRow,
  CollapsibleSection,
} from "../../components/create";

/* ── Design tokens ─────────────────────────────────────────── */
const PAGE_BG = "#F9F8F6";

/* ── Helper ────────────────────────────────────────────────── */
function buildEventAssistDraft(
  title: string,
  description: string,
  startsAtInput: string,
  addressDisplay: string,
  onlineUrl: string
) {
  const lines = [`Title: ${title.trim()}`];
  if (startsAtInput.trim()) lines.push(`Start time (as entered): ${startsAtInput.trim()}`);
  if (addressDisplay.trim()) lines.push(`Location: ${addressDisplay.trim()}`);
  if (onlineUrl.trim()) lines.push(`Online: ${onlineUrl.trim()}`);
  if (description.trim()) lines.push(`Notes: ${description.trim()}`);
  return lines.join("\n");
}

type Props = NativeStackScreenProps<RootStackParamList, "CreateEvent">;

export function CreateEventScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAtInput, setStartsAtInput] = useState("");
  const [endsAtInput, setEndsAtInput] = useState("");
  const [locationType, setLocationType] = useState<"in_person" | "online">("in_person");
  const [addressDisplay, setAddressDisplay] = useState("");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [createdEventId, setCreatedEventId] = useState<number | null>(null);

  const handleEventCelebrationFinish = useCallback(() => {
    setCreatedEventId((id) => {
      if (id != null) navigation.replace("EventDetail", { id });
      return null;
    });
  }, [navigation]);

  /* ── AI polish ── */
  const assistMutation = useMutation({
    mutationFn: async () => {
      const draft = buildEventAssistDraft(title, description, startsAtInput, addressDisplay, onlineUrl);
      const res = await assistPostText(draft, "event_listing");
      return res.suggestion;
    },
    onSuccess: (suggestion) => setDescription(suggestion)
  });

  const canPolishDescription =
    title.trim().length >= 3 &&
    Boolean(description.trim() || startsAtInput.trim() || addressDisplay.trim() || onlineUrl.trim());

  /* ── Create event ── */
  const createMutation = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      if (t.length < 3) throw new Error("Title must be at least 3 characters.");
      const startsAt = parseEventStartsAtInput(startsAtInput);
      return createEvent({
        title: t,
        description: description.trim() || null,
        startsAt: startsAt.toISOString(),
        addressDisplay: addressDisplay.trim() || null,
        isOnline: locationType === "online" || Boolean(onlineUrl.trim()),
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
      setEndsAtInput("");
      setAddressDisplay("");
      setOnlineUrl("");
      setCreatedEventId(event.id);
    }
  });

  const canCreate = title.trim().length >= 3;

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Event Basics ── */}
          <FormCard>
            <Text style={styles.cardHeading}>Event basics</Text>
            <SoftTextInput
              label="Title"
              placeholder="Event title"
              value={title}
              onChangeText={setTitle}
              maxLength={180}
            />
            <UploadCard
              height={120}
              title="Cover photo (optional)"
              hint="Add a cover image for your event"
              icon="image-outline"
              onPress={() => {}}
            />
            <SoftTextInput
              label="Short summary (optional)"
              placeholder="A brief subtitle for your event"
              value=""
              onChangeText={() => {}}
            />
          </FormCard>

          {/* ── Schedule ── */}
          <FormCard>
            <Text style={styles.cardHeading}>Schedule</Text>
            <SoftTextInput
              label="Starts"
              placeholder="e.g. 2026-04-18 18:30 or 12:30"
              value={startsAtInput}
              onChangeText={setStartsAtInput}
            />
            <SoftTextInput
              label="Ends (optional)"
              placeholder="e.g. 2026-04-18 20:00"
              value={endsAtInput}
              onChangeText={setEndsAtInput}
            />
            <Text style={styles.helper}>Time zone is detected automatically from your device.</Text>
          </FormCard>

          {/* ── Location (conditional) ── */}
          <FormCard>
            <Text style={styles.cardHeading}>Location</Text>
            <SubtypeSegmentedControl
              options={[
                { key: "in_person", label: "In-person" },
                { key: "online", label: "Online" },
              ]}
              value={locationType}
              onChange={(k) => setLocationType(k as "in_person" | "online")}
            />
            {locationType === "in_person" ? (
              <SoftTextInput
                label="Address"
                placeholder="Street address or venue name"
                value={addressDisplay}
                onChangeText={setAddressDisplay}
                maxLength={500}
              />
            ) : (
              <SoftTextInput
                label="Meeting URL"
                placeholder="https://zoom.us/... or similar"
                value={onlineUrl}
                onChangeText={setOnlineUrl}
                autoCapitalize="none"
                keyboardType="url"
                maxLength={2000}
              />
            )}
          </FormCard>

          {/* ── Description / Tools ── */}
          <FormCard>
            <Text style={styles.cardHeading}>Description</Text>
            <SoftTextArea
              placeholder="Tell people about your event..."
              value={description}
              onChangeText={setDescription}
              minHeight={120}
              maxLength={4000}
            />
            <AIHelperRow
              label="Improve with AI"
              onPress={() => assistMutation.mutate()}
              busy={assistMutation.isPending}
              disabled={!canPolishDescription}
            />
            {assistMutation.isError ? (
              <Text style={styles.errorSmall}>
                {assistMutation.error instanceof ApiError
                  ? assistMutation.error.message
                  : "Could not polish. Try again."}
              </Text>
            ) : null}
            <Text style={styles.helper}>
              Add title plus time, place, link, or rough notes — then polish into a clear description.
            </Text>
          </FormCard>

          {/* ── Event options (collapsed) ── */}
          <FormCard>
            <CollapsibleSection title="Event options">
              <Text style={styles.helper}>RSVP limit, public/private, and event chat settings.</Text>
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>Public event</Text>
                <Text style={styles.optionValue}>Yes</Text>
              </View>
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>Event chat</Text>
                <Text style={styles.optionValue}>Enabled</Text>
              </View>
            </CollapsibleSection>
          </FormCard>

          {/* ── Errors ── */}
          {createMutation.error ? (
            <Text style={styles.error}>
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Could not create event."}
            </Text>
          ) : null}
        </ScrollView>

        {/* ── Sticky CTA ── */}
        <StickyCtaBar
          primaryLabel={createMutation.isPending ? "Creating..." : "Create event"}
          onPrimary={() => createMutation.mutate()}
          primaryDisabled={!canCreate}
          primaryLoading={createMutation.isPending}
        />
      </KeyboardAvoidingView>

      <PostPublishSuccessOverlay
        visible={createdEventId != null}
        variant="event"
        onFinish={handleEventCelebrationFinish}
      />
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 24,
  },
  cardHeading: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  helper: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
  errorSmall: {
    fontSize: 12,
    color: colors.danger,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 44,
    paddingVertical: 4,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.text,
  },
  optionValue: {
    fontSize: 14,
    color: colors.muted,
  }
});
