import { useCallback, useState } from "react";
import type { DocumentPickerAsset } from "expo-document-picker";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PostPublishSuccessOverlay } from "../../components/PostPublishSuccessOverlay";
import { ApiError } from "../../lib/api";
import { assistPostText } from "../../lib/ai-assist";
import { parseEventStartsAtInput } from "../../lib/event-starts-at";
import { pickVisualMedia } from "../../lib/pick-visual-media";
import { createEvent } from "../../lib/events";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import {
  CreateAppBar,
  FormCard,
  SoftTextInput,
  SoftTextArea,
  StickyCtaBar,
  UploadCard,
  SubtypeSegmentedControl,
  AIHelperRow,
  CollapsibleSection
} from "../../components/create";
import { useCreateFlowTheme } from "../../components/ui";

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

function assetLooksLikeImage(asset: Pick<DocumentPickerAsset, "mimeType" | "name">) {
  const mimeType = String(asset.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) {
    return true;
  }
  const name = String(asset.name || "").toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(name);
}

type Props = NativeStackScreenProps<RootStackParamList, "CreateEvent">;

export function CreateEventScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const cf = useCreateFlowTheme();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [startsAtInput, setStartsAtInput] = useState("");
  const [endsAtInput, setEndsAtInput] = useState("");
  const [locationType, setLocationType] = useState<"in_person" | "online">("in_person");
  const [addressDisplay, setAddressDisplay] = useState("");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [coverAsset, setCoverAsset] = useState<DocumentPickerAsset | null>(null);
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

  const pickCoverImage = useCallback(() => {
    pickVisualMedia({ kind: "post" }, (asset) => {
      if (!asset) {
        return;
      }
      if (!assetLooksLikeImage(asset)) {
        Alert.alert("Image required", "Please pick an image from your library, camera, or files.");
        return;
      }
      setCoverAsset(asset);
    });
  }, []);

  /* ── Create event ── */
  const createMutation = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      if (t.length < 3) throw new Error("Title must be at least 3 characters.");
      const startsAt = parseEventStartsAtInput(startsAtInput);
      const tag = tagline.trim();
      const desc = description.trim();
      const combinedDescription =
        tag && desc ? `${tag}\n\n${desc}` : tag || desc ? tag || desc : null;
      return createEvent({
        title: t,
        description: combinedDescription,
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
      setTagline("");
      setDescription("");
      setStartsAtInput("");
      setEndsAtInput("");
      setAddressDisplay("");
      setOnlineUrl("");
      setCoverAsset(null);
      setCreatedEventId(event.id);
    }
  });

  const canCreate = title.trim().length >= 3;

  return (
    <View style={cf.layout}>
      <CreateAppBar title="Create event" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[cf.scrollContent, { paddingBottom: insets.bottom + 110 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Event Basics ── */}
          <FormCard>
            <Text style={cf.sectionTitle}>Event basics</Text>
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
              hint="Tap to choose from library, camera, or files"
              icon="image-outline"
              uri={coverAsset?.uri}
              mimeType={coverAsset?.mimeType || null}
              onPress={pickCoverImage}
              onReplace={coverAsset ? pickCoverImage : undefined}
              onRemove={coverAsset ? () => setCoverAsset(null) : undefined}
            />
            <SoftTextInput
              label="Short summary (optional)"
              placeholder="A brief subtitle for your event"
              value={tagline}
              onChangeText={setTagline}
              maxLength={220}
            />
          </FormCard>

          {/* ── Schedule ── */}
          <FormCard>
            <Text style={cf.sectionTitle}>Schedule</Text>
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
            <Text style={cf.helperSmall}>Time zone is detected automatically from your device.</Text>
          </FormCard>

          {/* ── Location (conditional) ── */}
          <FormCard>
            <Text style={cf.sectionTitle}>Location</Text>
            <SubtypeSegmentedControl
              options={[
                { key: "in_person", label: "In-person" },
                { key: "online", label: "Online" }
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
            <Text style={cf.sectionTitle}>Description</Text>
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
              <Text style={cf.errorSmall}>
                {assistMutation.error instanceof ApiError
                  ? assistMutation.error.message
                  : "Could not polish. Try again."}
              </Text>
            ) : null}
            <Text style={cf.helper}>
              Add title plus time, place, link, or rough notes — then polish into a clear description.
            </Text>
          </FormCard>

          {/* ── Event options (collapsed) ── */}
          <FormCard>
            <CollapsibleSection title="Event options">
              <Text style={cf.helper}>RSVP limit, public/private, and event chat settings.</Text>
              <View style={cf.metaRow}>
                <Text style={cf.metaRowLabel}>Public event</Text>
                <Text style={cf.metaRowValue}>Yes</Text>
              </View>
              <View style={cf.metaRow}>
                <Text style={cf.metaRowLabel}>Event chat</Text>
                <Text style={cf.metaRowValue}>Enabled</Text>
              </View>
            </CollapsibleSection>
          </FormCard>

          {/* ── Errors ── */}
          {createMutation.error ? (
            <Text style={cf.error}>
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
