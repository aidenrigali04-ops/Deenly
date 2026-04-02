import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../lib/api";
import {
  createProduct,
  publishProduct,
  type MonetizationBoostTier
} from "../../lib/monetization";
import { colors, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type UploadSignatureResponse = {
  uploadUrl: string;
  headers: Record<string, string>;
  key: string;
};

type Props = NativeStackScreenProps<RootStackParamList, "CreateProduct">;

function deriveMediaType(mimeType: string): "image" | "video" | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

function parseUsdToMinor(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  const minor = Math.round(n * 100);
  return minor > 0 ? minor : null;
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function CreateProductScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [productType, setProductType] = useState<"digital" | "service" | "subscription">("digital");
  const [audienceTarget, setAudienceTarget] = useState<"b2b" | "b2c" | "both">("both");
  const [businessCategory, setBusinessCategory] = useState("");
  const [boostTier, setBoostTier] = useState<MonetizationBoostTier>("standard");
  const [serviceDetails, setServiceDetails] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [deliveryFile, setDeliveryFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [formError, setFormError] = useState("");
  const [savedDraftId, setSavedDraftId] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-create-my-products"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-products"] });
    }
  });

  const publishMutation = useMutation({
    mutationFn: publishProduct,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-create-my-products"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-products"] });
    }
  });

  const pickDeliveryFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "video/*"],
      copyToCacheDirectory: true
    });
    if (!result.canceled && result.assets.length > 0) {
      setDeliveryFile(result.assets[0]);
    }
  };

  const onSaveDraft = async () => {
    setFormError("");
    const t = title.trim();
    if (t.length < 3) {
      setFormError("Title must be at least 3 characters.");
      return;
    }
    const priceMinor = parseUsdToMinor(priceUsd);
    if (priceMinor === null) {
      setFormError("Enter a valid price in USD (e.g. 9.99).");
      return;
    }

    try {
      let deliveryMediaKey: string | undefined;
      if (productType === "digital") {
        if (!deliveryFile) {
          setFormError("Choose a delivery file (image or video) for digital products.");
          return;
        }
        const mimeType = deliveryFile.mimeType || "application/octet-stream";
        const mediaType = deriveMediaType(mimeType);
        if (!mediaType) {
          setFormError("Delivery file must be an image or video.");
          return;
        }
        const signature = await apiRequest<UploadSignatureResponse>("/media/upload-signature", {
          method: "POST",
          auth: true,
          body: {
            mediaType,
            mimeType,
            originalFilename: deliveryFile.name,
            fileSizeBytes: deliveryFile.size || 1
          }
        });
        const blob = await (await fetch(deliveryFile.uri)).blob();
        const uploaded = await fetch(signature.uploadUrl, {
          method: "PUT",
          headers: signature.headers,
          body: blob
        });
        if (!uploaded.ok) {
          throw new Error("Could not upload delivery file.");
        }
        deliveryMediaKey = signature.key;
      }

      const row = await createMutation.mutateAsync({
        title: t,
        description: description.trim() || undefined,
        priceMinor,
        productType,
        deliveryMediaKey,
        serviceDetails: serviceDetails.trim() || undefined,
        deliveryMethod: deliveryMethod.trim().slice(0, 120) || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        audienceTarget,
        businessCategory: businessCategory.trim() || undefined,
        boostTier
      });
      setSavedDraftId(row.id);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not save product.");
    }
  };

  const onPublish = async () => {
    if (!savedDraftId) return;
    setFormError("");
    try {
      await publishMutation.mutateAsync(savedDraftId);
      navigation.goBack();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not publish.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lede}>
          Save a draft, publish when ready, then attach it from Create post or your Creator hub.
        </Text>

        {savedDraftId ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Draft saved. Publish to show it on your profile.</Text>
            <Pressable
              style={[styles.btnPrimary, publishMutation.isPending && styles.btnDisabled]}
              onPress={() => void onPublish()}
              disabled={publishMutation.isPending}
            >
              <Text style={styles.btnPrimaryText}>{publishMutation.isPending ? "Publishing…" : "Publish now"}</Text>
            </Pressable>
            <Pressable style={styles.btnGhost} onPress={() => navigation.goBack()}>
              <Text style={styles.btnGhostText}>Done</Text>
            </Pressable>
          </View>
        ) : null}

        <SectionLabel>Pricing & type</SectionLabel>
        <TextInput
          style={styles.input}
          placeholder="Price USD (e.g. 9.99)"
          placeholderTextColor={colors.muted}
          value={priceUsd}
          onChangeText={setPriceUsd}
          keyboardType="decimal-pad"
        />
        <View style={styles.chipRow}>
          {(["digital", "service", "subscription"] as const).map((pt) => (
            <Pressable
              key={pt}
              onPress={() => setProductType(pt)}
              style={[styles.chip, productType === pt && styles.chipOn]}
            >
              <Text style={[styles.chipText, productType === pt && styles.chipTextOn]}>{pt}</Text>
            </Pressable>
          ))}
        </View>

        <SectionLabel>Marketplace boost</SectionLabel>
        <View style={styles.chipRow}>
          {(
            [
              { k: "standard" as const, l: "Standard 3.5%" },
              { k: "boosted" as const, l: "Boosted 20%" },
              { k: "aggressive" as const, l: "Aggressive 35%" }
            ] as const
          ).map(({ k, l }) => (
            <Pressable key={k} onPress={() => setBoostTier(k)} style={[styles.chip, boostTier === k && styles.chipOn]}>
              <Text style={[styles.chipText, boostTier === k && styles.chipTextOn]} numberOfLines={1}>
                {l}
              </Text>
            </Pressable>
          ))}
        </View>

        <SectionLabel>Audience</SectionLabel>
        <View style={styles.chipRow}>
          {(
            [
              { k: "b2c" as const, l: "Consumers" },
              { k: "b2b" as const, l: "Businesses" },
              { k: "both" as const, l: "Both" }
            ] as const
          ).map(({ k, l }) => (
            <Pressable
              key={k}
              onPress={() => setAudienceTarget(k)}
              style={[styles.chip, audienceTarget === k && styles.chipOn]}
            >
              <Text style={[styles.chipText, audienceTarget === k && styles.chipTextOn]}>{l}</Text>
            </Pressable>
          ))}
        </View>

        <SectionLabel>Category (optional)</SectionLabel>
        <View style={styles.chipRowWrap}>
          {(
            [
              { k: "tools_growth", l: "Tools" },
              { k: "professional_services", l: "Services" },
              { k: "digital_products", l: "Digital" },
              { k: "education_coaching", l: "Coaching" },
              { k: "lifestyle_inspiration", l: "Lifestyle" }
            ] as const
          ).map(({ k, l }) => (
            <Pressable
              key={k}
              onPress={() => setBusinessCategory((c) => (c === k ? "" : k))}
              style={[styles.chip, businessCategory === k && styles.chipOn]}
            >
              <Text style={[styles.chipText, businessCategory === k && styles.chipTextOn]}>{l}</Text>
            </Pressable>
          ))}
        </View>

        <SectionLabel>Title</SectionLabel>
        <TextInput
          style={styles.input}
          placeholder="Product title"
          placeholderTextColor={colors.muted}
          value={title}
          onChangeText={setTitle}
          maxLength={180}
        />

        <SectionLabel>Description</SectionLabel>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="What buyers get"
          placeholderTextColor={colors.muted}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <SectionLabel>Delivery</SectionLabel>
        {productType === "digital" ? (
          <Pressable style={styles.filePick} onPress={pickDeliveryFile}>
            <Text style={styles.filePickText}>
              {deliveryFile ? deliveryFile.name || "File selected" : "Tap to choose delivery image or video"}
            </Text>
          </Pressable>
        ) : (
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Service details / what buyer receives"
            placeholderTextColor={colors.muted}
            value={serviceDetails}
            onChangeText={setServiceDetails}
            multiline
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Delivery method (email, DM, etc.)"
          placeholderTextColor={colors.muted}
          value={deliveryMethod}
          onChangeText={setDeliveryMethod}
          maxLength={120}
        />
        <TextInput
          style={styles.input}
          placeholder="Website https://…"
          placeholderTextColor={colors.muted}
          value={websiteUrl}
          onChangeText={setWebsiteUrl}
          autoCapitalize="none"
          keyboardType="url"
        />

        {formError ? <Text style={styles.error}>{formError}</Text> : null}

        {!savedDraftId ? (
          <Pressable
            style={[styles.btnPrimary, createMutation.isPending && styles.btnDisabled]}
            onPress={() => void onSaveDraft()}
            disabled={createMutation.isPending}
          >
            <Text style={styles.btnPrimaryText}>{createMutation.isPending ? "Saving…" : "Save draft"}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, gap: 10 },
  lede: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  sectionLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface
  },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipRowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.subtleFill },
  chipText: { fontSize: 13, color: colors.muted, fontWeight: "600", textTransform: "capitalize" },
  chipTextOn: { color: colors.text },
  filePick: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.control,
    padding: 14,
    backgroundColor: colors.surface
  },
  filePickText: { fontSize: 14, color: colors.accent, fontWeight: "600" },
  error: { color: colors.danger, fontSize: 14, marginTop: 4 },
  btnPrimary: {
    marginTop: 16,
    backgroundColor: colors.accent,
    borderRadius: radii.control,
    paddingVertical: 14,
    alignItems: "center"
  },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  banner: {
    padding: 14,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 10,
    marginBottom: 8
  },
  bannerText: { fontSize: 14, color: colors.text, fontWeight: "600" },
  btnGhost: { paddingVertical: 8, alignItems: "center" },
  btnGhostText: { fontSize: 15, color: colors.muted, fontWeight: "600" }
});
