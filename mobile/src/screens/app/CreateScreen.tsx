import { useEffect, useMemo, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { AppVideoView } from "../../components/AppVideoView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, apiRequest } from "../../lib/api";
import { assistPostText } from "../../lib/ai-assist";
import { fetchSessionMe } from "../../lib/auth";
import { attachProductToPost, fetchMyProducts, type CreatorProductRow } from "../../lib/monetization";
import { fetchInstagramStatus, requestInstagramCrossPost } from "../../lib/instagram";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { colors, radii, shadows, spacing } from "../../theme";
import { resolveMediaUrl } from "../../lib/media-url";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";

type CreatePostResponse = { id: number };
type UploadSignatureResponse = {
  uploadUrl: string;
  headers: Record<string, string>;
  key: string;
};
type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "CreateTab">,
  NativeStackScreenProps<RootStackParamList>
>;

function deriveMediaType(mimeType: string): "image" | "video" | null {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  return null;
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function applyCatalogProductToPromoteForm(
  row: CreatorProductRow,
  set: {
    setProductType: (v: "digital" | "service" | "subscription") => void;
    setPriceMinor: (v: string) => void;
    setProductTitle: (v: string) => void;
    setProductDescription: (v: string) => void;
    setServiceDetails: (v: string) => void;
    setServiceKeyPoints: (v: string) => void;
    setDeliveryMethod: (v: string) => void;
    setWebsiteUrl: (v: string) => void;
    setAudienceTarget: (v: "b2b" | "b2c" | "both") => void;
    setBusinessCategory: (v: string) => void;
    setProductFile: (v: DocumentPicker.DocumentPickerAsset | null) => void;
    setServiceAssistErr: (v: string) => void;
  }
) {
  const pt = row.product_type;
  if (pt === "digital" || pt === "service" || pt === "subscription") {
    set.setProductType(pt);
  }
  set.setPriceMinor(String(Number(row.price_minor) > 0 ? row.price_minor : ""));
  set.setProductTitle((row.title || "").trim());
  set.setProductDescription((row.description || "").trim());
  set.setServiceDetails((row.service_details || "").trim());
  set.setServiceKeyPoints("");
  set.setDeliveryMethod((row.delivery_method || "").trim());
  const site = (row.website_url || "").trim();
  set.setWebsiteUrl(site);
  const at = row.audience_target;
  if (at === "b2b" || at === "b2c" || at === "both") {
    set.setAudienceTarget(at);
  } else {
    set.setAudienceTarget("both");
  }
  set.setBusinessCategory((row.business_category || "").trim());
  set.setProductFile(null);
  set.setServiceAssistErr("");
}

export function CreateScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const compact = viewportHeight <= 700;
  const [postType, setPostType] = useState<"post" | "marketplace" | "reel">("post");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [productFile, setProductFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [sellThis, setSellThis] = useState(false);
  const [productType, setProductType] = useState<"digital" | "service" | "subscription">("digital");
  const [priceMinor, setPriceMinor] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [serviceDetails, setServiceDetails] = useState("");
  const [serviceKeyPoints, setServiceKeyPoints] = useState("");
  const [serviceAssistBusy, setServiceAssistBusy] = useState(false);
  const [serviceAssistErr, setServiceAssistErr] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [audienceTarget, setAudienceTarget] = useState<"b2b" | "b2c" | "both">("both");
  const [businessCategory, setBusinessCategory] = useState("");
  const [crossPostToInstagram, setCrossPostToInstagram] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ["mobile-create-session"],
    queryFn: () => fetchSessionMe()
  });
  const profileQuery = useQuery({
    queryKey: ["mobile-create-profile"],
    queryFn: () =>
      apiRequest<{
        display_name: string;
        avatar_url?: string | null;
      }>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });

  const composerName = useMemo(() => {
    const p = profileQuery.data;
    const s = sessionQuery.data;
    if (p?.display_name?.trim()) {
      return p.display_name.trim();
    }
    if (s?.username?.trim()) {
      return s.username.trim();
    }
    if (s?.email) {
      return s.email.split("@")[0] || "You";
    }
    return "You";
  }, [profileQuery.data, sessionQuery.data]);

  const avatarUri = resolveMediaUrl(profileQuery.data?.avatar_url) || undefined;

  const previewMime = useMemo(() => {
    if (!selectedFile) {
      return null;
    }
    const fallback = selectedFile.name?.toLowerCase().match(/\.(png|jpe?g|webp|gif)$/)
      ? "image/jpeg"
      : "video/mp4";
    return selectedFile.mimeType || fallback;
  }, [selectedFile]);
  const previewKind = previewMime ? deriveMediaType(previewMime) : null;

  const myProductsQuery = useQuery({
    queryKey: ["mobile-create-my-products"],
    queryFn: () => fetchMyProducts({ limit: 50 })
  });
  const instagramQuery = useQuery({
    queryKey: ["mobile-instagram-status"],
    queryFn: () => fetchInstagramStatus(),
    retry: false
  });
  const igConnected = Boolean(instagramQuery.data?.connected);

  useEffect(() => {
    if (sellThis) {
      setPostType("marketplace");
    }
  }, [sellThis]);

  useEffect(() => {
    if (postType === "reel") {
      setSellThis(false);
    }
  }, [postType]);

  const pickMedia = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: postType === "reel" ? "video/*" : ["image/*", "video/*"],
      copyToCacheDirectory: true
    });
    if (!result.canceled && result.assets.length > 0) {
      setSelectedFile(result.assets[0]);
    }
  };

  const pickProductFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "video/*"],
      copyToCacheDirectory: true
    });
    if (!result.canceled && result.assets.length > 0) {
      setProductFile(result.assets[0]);
    }
  };

  const generateServiceDescriptionForSell = async () => {
    const k = serviceKeyPoints.trim();
    if (k.length < 5) {
      setServiceAssistErr("Add key points (bullets or short notes).");
      return;
    }
    setServiceAssistErr("");
    setServiceAssistBusy(true);
    try {
      const lines = [
        productTitle.trim() ? `Product title: ${productTitle.trim()}` : null,
        `Product type: ${productType}`,
        "",
        "Key points from creator:",
        k
      ]
        .filter(Boolean)
        .join("\n");
      const res = await assistPostText(lines, "service_details_generate");
      setServiceDetails(res.suggestion);
    } catch (e) {
      setServiceAssistErr(e instanceof ApiError ? e.message : "Could not generate.");
    } finally {
      setServiceAssistBusy(false);
    }
  };

  const createPost = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      if (postType === "reel") {
        if (!selectedFile) {
          throw new Error("Select a video for your reel.");
        }
        const m = selectedFile.mimeType || "";
        if (!m.startsWith("video/")) {
          throw new Error("Reels require a video file.");
        }
      }

      if (crossPostToInstagram && !selectedFile) {
        throw new Error("Attach image or video to cross-post to Instagram.");
      }

      const inlineSellThisProduct = Boolean(sellThis && selectedProductId == null);

      let deliveryMediaKey: string | undefined;
      if (inlineSellThisProduct && productType === "digital") {
        if (!productFile) {
          throw new Error("Select a delivery file for digital product.");
        }
        const productMimeType = productFile.mimeType || "application/octet-stream";
        const productMediaType = deriveMediaType(productMimeType);
        if (!productMediaType) {
          throw new Error("Digital delivery file must be image or video.");
        }
        const signature = await apiRequest<UploadSignatureResponse>("/media/upload-signature", {
          method: "POST",
          auth: true,
          body: {
            mediaType: productMediaType,
            mimeType: productMimeType,
            originalFilename: productFile.name,
            fileSizeBytes: productFile.size || 1
          }
        });
        const productFileResponse = await fetch(productFile.uri);
        const productFileBlob = await productFileResponse.blob();
        const productUploadResponse = await fetch(signature.uploadUrl, {
          method: "PUT",
          headers: signature.headers,
          body: productFileBlob
        });
        if (!productUploadResponse.ok) {
          throw new Error("Unable to upload product delivery file.");
        }
        deliveryMediaKey = signature.key;
      }
      const post = await apiRequest<CreatePostResponse>("/posts", {
        method: "POST",
        auth: true,
        body: {
          postType,
          content,
          tags: tagsInput
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          isBusinessPost: sellThis,
          sellThis: inlineSellThisProduct,
          audienceTarget: sellThis ? audienceTarget : "both",
          businessCategory: sellThis && businessCategory ? businessCategory : undefined,
          productType,
          priceMinor: inlineSellThisProduct ? Number(priceMinor) : undefined,
          productTitle: inlineSellThisProduct && productTitle.trim() ? productTitle.trim() : undefined,
          productDescription:
            inlineSellThisProduct && productDescription.trim() ? productDescription.trim() : undefined,
          serviceDetails: inlineSellThisProduct && serviceDetails.trim() ? serviceDetails.trim() : undefined,
          deliveryMethod: inlineSellThisProduct && deliveryMethod.trim() ? deliveryMethod.trim() : undefined,
          websiteUrl: inlineSellThisProduct && websiteUrl.trim() ? websiteUrl.trim() : undefined,
          deliveryMediaKey,
          ...(postType === "reel" && selectedFile
            ? { mediaMimeType: selectedFile.mimeType || "video/mp4" }
            : {})
        }
      });

      if (selectedFile) {
        const fallbackMime = selectedFile.name?.toLowerCase().match(/\.(png|jpe?g|webp|gif)$/)
          ? "image/jpeg"
          : "video/mp4";
        const mimeType = selectedFile.mimeType || fallbackMime;
        const mediaType = deriveMediaType(mimeType);
        if (!mediaType) {
          throw new Error("Only image and video uploads are supported.");
        }

        const signature = await apiRequest<UploadSignatureResponse>("/media/upload-signature", {
          method: "POST",
          auth: true,
          body: {
            mediaType,
            mimeType,
            originalFilename: selectedFile.name,
            fileSizeBytes: selectedFile.size || 1
          }
        });

        const fileResponse = await fetch(selectedFile.uri);
        const fileBlob = await fileResponse.blob();

        const uploadResponse = await fetch(signature.uploadUrl, {
          method: "PUT",
          headers: signature.headers,
          body: fileBlob
        });
        if (!uploadResponse.ok) {
          throw new Error("Unable to upload selected media.");
        }

        await apiRequest(`/media/posts/${post.id}/attach`, {
          method: "POST",
          auth: true,
          body: {
            mediaKey: signature.key,
            mediaUrl: signature.key,
            mimeType,
            fileSizeBytes: selectedFile.size || fileBlob.size || 1
          }
        });

        if (crossPostToInstagram) {
          try {
            await requestInstagramCrossPost(post.id);
          } catch {
            /* non-blocking */
          }
        }
      }
      if (selectedProductId) {
        await attachProductToPost(post.id, selectedProductId);
      }

      await queryClient.invalidateQueries({ queryKey: ["mobile-feed"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-feed-reels"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-products"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-catalog"] });
      const meId = sessionQuery.data?.id;
      if (meId) {
        await queryClient.invalidateQueries({ queryKey: ["mobile-user-posts", meId] });
        await queryClient.invalidateQueries({ queryKey: ["mobile-account-posts", meId] });
      }

      setContent("");
      setTagsInput("");
      setSelectedFile(null);
      setProductFile(null);
      setSelectedProductId(null);
      setSellThis(false);
      setProductType("digital");
      setPriceMinor("");
      setProductTitle("");
      setProductDescription("");
      setServiceDetails("");
      setServiceKeyPoints("");
      setServiceAssistErr("");
      setDeliveryMethod("");
      setWebsiteUrl("");
      setAudienceTarget("both");
      setBusinessCategory("");
      setCrossPostToInstagram(false);
      navigation.navigate("PostDetail", { id: post.id });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to create post";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.headerBar,
          compact && styles.headerBarCompact,
          { paddingTop: insets.top + (compact ? 6 : 8) }
        ]}
      >
        <Text style={styles.headerTitle}>Create New Post</Text>
        <Pressable
          onPress={() => navigation.navigate("CreateProduct")}
          style={({ pressed }) => [styles.headerProductLink, pressed && styles.pressableSoft]}
          accessibilityRole="button"
          accessibilityLabel="Add product without a post"
        >
          <Text style={styles.headerProductLinkText}>Add product</Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            compact && styles.scrollContentCompact,
            { paddingBottom: insets.bottom + (compact ? 16 : 24) }
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={pickMedia}
            style={({ pressed }) => [
              styles.mediaPreview,
              compact && styles.mediaPreviewCompact,
              pressed && styles.mediaPreviewPressed
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add or change photo or video"
            accessibilityHint="Opens the file picker for an image or video"
          >
            {selectedFile && previewKind === "image" ? (
              <Image
                source={{ uri: selectedFile.uri }}
                style={[styles.mediaPreviewFill, compact && styles.mediaPreviewFillCompact]}
                resizeMode="contain"
              />
            ) : null}
            {selectedFile && previewKind === "video" ? (
              <AppVideoView
                key={selectedFile.uri}
                uri={selectedFile.uri}
                style={[styles.mediaPreviewFill, compact && styles.mediaPreviewFillCompact]}
                contentFit="contain"
                loop
                play
                muted
              />
            ) : null}
            {!selectedFile ? (
              <Text style={[styles.mediaPlaceholder, compact && styles.mediaPlaceholderCompact]}>
                {postType === "reel" ? "Tap to add video (vertical works best)" : "Tap to add photo or video"}
              </Text>
            ) : null}
          </Pressable>

          <View style={[styles.composerCard, compact && styles.composerCardCompact]}>
            <View style={[styles.identityRow, compact && styles.identityRowCompact]}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={[styles.avatar, compact && styles.avatarCompact]} resizeMode="cover" />
              ) : (
                <View style={[styles.avatarFallback, compact && styles.avatarFallbackCompact]}>
                  <Text style={[styles.avatarFallbackText, compact && styles.avatarFallbackTextCompact]}>
                    {composerName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={[styles.composerName, compact && styles.composerNameCompact]} numberOfLines={1}>
                {composerName}
              </Text>
            </View>
            <TextInput
              style={[styles.inputComposer, compact && styles.inputComposerCompact]}
              multiline
              placeholder="What's on your mind?"
              placeholderTextColor={colors.composerMuted}
              value={content}
              onChangeText={setContent}
              textAlignVertical="top"
              accessibilityLabel="Post caption"
            />
            <TextInput
              style={[styles.inputComposerSingle, compact && styles.inputComposerSingleCompact]}
              placeholder="Tags (comma separated)"
              placeholderTextColor={colors.composerMuted}
              value={tagsInput}
              onChangeText={setTagsInput}
            />
            <View style={styles.divider} />
            {postType !== "reel" ? (
              <>
                <View style={[styles.promoteRow, compact && styles.promoteRowCompact]}>
                  <View style={styles.promoteTextBlock}>
                    <Text style={[styles.promoteLabel, compact && styles.promoteLabelCompact]}>Promote</Text>
                    <Text style={[styles.promoteHint, compact && styles.promoteHintCompact]}>
                      Add pricing and offer details
                    </Text>
                  </View>
                  <Switch
                    value={sellThis}
                    onValueChange={setSellThis}
                    trackColor={{ false: colors.composerBorder, true: colors.accent }}
                    thumbColor={Platform.OS === "android" ? colors.composerInputBg : undefined}
                    accessibilityLabel="Promote this post"
                  />
                </View>
                {sellThis ? (
              <View style={[styles.promoteFields, compact && styles.promoteFieldsCompact]}>
                {(myProductsQuery.data?.items || []).length > 0 ? (
                  <>
                    <SectionTitle>Attach catalog product</SectionTitle>
                    <Text style={styles.helperLight}>
                      Choose a listing first — we fill pricing, type, audience, offer copy, and delivery from that
                      product. No duplicate product is created when you attach.
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.attachChipsScrollContent}
                      style={styles.attachChipsScroll}
                    >
                      {(myProductsQuery.data?.items || []).map((item) => {
                        const productId = Number(item.id);
                        if (!productId) {
                          return null;
                        }
                        return (
                          <Pressable
                            key={productId}
                            onPress={() => {
                              setSelectedProductId(productId);
                              applyCatalogProductToPromoteForm(item, {
                                setProductType,
                                setPriceMinor,
                                setProductTitle,
                                setProductDescription,
                                setServiceDetails,
                                setServiceKeyPoints,
                                setDeliveryMethod,
                                setWebsiteUrl,
                                setAudienceTarget,
                                setBusinessCategory,
                                setProductFile,
                                setServiceAssistErr
                              });
                            }}
                            style={({ pressed }) => [
                              styles.chipLight,
                              selectedProductId === productId ? styles.chipLightActive : null,
                              compact && styles.chipLightCompact,
                              pressed ? styles.pressableSoft : null
                            ]}
                          >
                            <Text
                              style={[
                                styles.chipLightText,
                                selectedProductId === productId ? styles.chipLightTextActive : null
                              ]}
                              numberOfLines={1}
                            >
                              {item.title || `Product ${productId}`}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    {selectedProductId ? (
                      <Pressable
                        onPress={() => {
                          setSelectedProductId(null);
                          setProductType("digital");
                          setPriceMinor("");
                          setProductTitle("");
                          setProductDescription("");
                          setServiceDetails("");
                          setServiceKeyPoints("");
                          setDeliveryMethod("");
                          setWebsiteUrl("");
                          setAudienceTarget("both");
                          setBusinessCategory("");
                          setProductFile(null);
                          setServiceAssistErr("");
                        }}
                        style={({ pressed }) => [
                          styles.buttonSecondaryLight,
                          compact && styles.buttonSecondaryLightCompact,
                          pressed && styles.pressableSoft
                        ]}
                      >
                        <Text style={styles.buttonSecondaryLightText}>Clear attached product</Text>
                      </Pressable>
                    ) : null}
                    <View style={styles.dividerThin} />
                  </>
                ) : null}
                <SectionTitle>Pricing and type</SectionTitle>
                <TextInput
                  style={[styles.inputComposerSingle, compact && styles.inputComposerSingleCompact]}
                  placeholder="Price (minor units)"
                  placeholderTextColor={colors.composerMuted}
                  value={priceMinor}
                  onChangeText={setPriceMinor}
                  keyboardType="number-pad"
                />
                <View style={[styles.typeRowWrap, compact && styles.typeRowWrapCompact]}>
                  {(["digital", "service", "subscription"] as const).map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => setProductType(type)}
                      style={({ pressed }) => [
                        styles.chipLight,
                        productType === type ? styles.chipLightActive : null,
                        compact && styles.chipLightCompact,
                        pressed && styles.pressableSoft
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipLightText,
                          productType === type ? styles.chipLightTextActive : null
                        ]}
                      >
                        {type}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <SectionTitle>Who it is for</SectionTitle>
                <View style={[styles.typeRowWrap, compact && styles.typeRowWrapCompact]}>
                  {([
                    { key: "b2c", label: "Consumers" },
                    { key: "b2b", label: "Businesses" },
                    { key: "both", label: "Both" }
                  ] as const).map((item) => (
                    <Pressable
                      key={item.key}
                      onPress={() => setAudienceTarget(item.key)}
                      style={({ pressed }) => [
                        styles.chipLight,
                        audienceTarget === item.key ? styles.chipLightActive : null,
                        compact && styles.chipLightCompact,
                        pressed && styles.pressableSoft
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipLightText,
                          audienceTarget === item.key ? styles.chipLightTextActive : null
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <SectionTitle>Category</SectionTitle>
                <View style={[styles.typeRowWrap, compact && styles.typeRowWrapCompact]}>
                  {([
                    { key: "tools_growth", label: "Tools" },
                    { key: "professional_services", label: "Services" },
                    { key: "digital_products", label: "Digital" },
                    { key: "education_coaching", label: "Coaching" },
                    { key: "lifestyle_inspiration", label: "Lifestyle" }
                  ] as const).map((item) => (
                    <Pressable
                      key={item.key}
                      onPress={() => setBusinessCategory(item.key)}
                      style={({ pressed }) => [
                        styles.chipLight,
                        businessCategory === item.key ? styles.chipLightActive : null,
                        compact && styles.chipLightCompact,
                        pressed && styles.pressableSoft
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipLightText,
                          businessCategory === item.key ? styles.chipLightTextActive : null
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <SectionTitle>Offer copy</SectionTitle>
                <TextInput
                  style={[styles.inputComposerSingle, compact && styles.inputComposerSingleCompact]}
                  placeholder="Product title"
                  placeholderTextColor={colors.composerMuted}
                  value={productTitle}
                  onChangeText={setProductTitle}
                />
                <TextInput
                  style={[styles.inputComposer, compact && styles.inputComposerCompact]}
                  multiline
                  placeholder="Product or offer description"
                  placeholderTextColor={colors.composerMuted}
                  value={productDescription}
                  onChangeText={setProductDescription}
                  textAlignVertical="top"
                />
                <SectionTitle>Delivery</SectionTitle>
                {productType === "digital" ? (
                  <View style={styles.fileRow}>
                    {selectedProductId ? (
                      <Text style={styles.mutedLight}>
                        Delivery media is stored on the attached catalog product — no upload needed for this post.
                      </Text>
                    ) : (
                      <>
                        <Pressable
                          style={({ pressed }) => [
                            styles.buttonSecondaryLight,
                            compact && styles.buttonSecondaryLightCompact,
                            pressed && styles.pressableSoft
                          ]}
                          onPress={pickProductFile}
                        >
                          <Text style={styles.buttonSecondaryLightText}>Upload delivery file</Text>
                        </Pressable>
                        {productFile ? (
                          <Text style={styles.mutedLight} numberOfLines={1}>
                            {productFile.name}
                          </Text>
                        ) : null}
                      </>
                    )}
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    <TextInput
                      style={[styles.inputComposer, compact && styles.inputComposerCompact]}
                      multiline
                      placeholder="Key points — what you offer, who it is for…"
                      placeholderTextColor={colors.composerMuted}
                      value={serviceKeyPoints}
                      onChangeText={setServiceKeyPoints}
                      textAlignVertical="top"
                    />
                    <Pressable
                      style={({ pressed }) => [
                        styles.buttonSecondaryLight,
                        compact && styles.buttonSecondaryLightCompact,
                        serviceAssistBusy && { opacity: 0.6 },
                        pressed && !serviceAssistBusy ? styles.pressableSoft : null
                      ]}
                      onPress={() => void generateServiceDescriptionForSell()}
                      disabled={serviceAssistBusy}
                    >
                      <Text style={styles.buttonSecondaryLightText}>
                        {serviceAssistBusy ? "Generating…" : "Generate with AI"}
                      </Text>
                    </Pressable>
                    {serviceAssistErr ? (
                      <Text style={[styles.mutedLight, { color: colors.danger }]}>{serviceAssistErr}</Text>
                    ) : null}
                    <Text style={styles.helperLight}>Edit the generated text below before posting.</Text>
                    <TextInput
                      style={[styles.inputComposer, compact && styles.inputComposerCompact]}
                      multiline
                      placeholder="Service description & value proposition"
                      placeholderTextColor={colors.composerMuted}
                      value={serviceDetails}
                      onChangeText={setServiceDetails}
                      textAlignVertical="top"
                    />
                  </View>
                )}
                <TextInput
                  style={[styles.inputComposerSingle, compact && styles.inputComposerSingleCompact]}
                  placeholder="Delivery method (email, DM, booking call)"
                  placeholderTextColor={colors.composerMuted}
                  value={deliveryMethod}
                  onChangeText={setDeliveryMethod}
                />
                <TextInput
                  style={[styles.inputComposerSingle, compact && styles.inputComposerSingleCompact]}
                  placeholder="Website URL (https://...)"
                  placeholderTextColor={colors.composerMuted}
                  value={websiteUrl}
                  onChangeText={setWebsiteUrl}
                  autoCapitalize="none"
                />
              </View>
            ) : null}
              </>
            ) : (
              <Text style={styles.muted}>
                Reels use one video only. Open the Reels tab to watch full-screen reels.
              </Text>
            )}
          </View>

          <View style={[styles.moreSection, compact && styles.moreSectionCompact]}>
            <Text style={styles.moreHeading}>Post type</Text>
            <View style={[styles.typeRowWrap, compact && styles.typeRowWrapCompact]}>
              {(
                [
                  ["post", "Post"],
                  ["marketplace", "Marketplace"],
                  ["reel", "Reel"]
                ] as const
              ).map(([type, label]) => (
                <Pressable
                  key={type}
                  onPress={() => setPostType(type)}
                  disabled={sellThis}
                  style={({ pressed }) => [
                    styles.chip,
                    postType === type ? styles.chipActive : null,
                    compact && styles.chipCompact,
                    sellThis ? { opacity: 0.5 } : null,
                    pressed && !sellThis ? styles.pressableSoft : null
                  ]}
                >
                  <Text style={styles.chipText}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.fileRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.chip,
                  crossPostToInstagram && igConnected ? styles.chipActive : null,
                  compact && styles.chipCompact,
                  pressed && igConnected ? styles.pressableSoft : null
                ]}
                onPress={() => {
                  if (igConnected) {
                    setCrossPostToInstagram((v) => !v);
                  }
                }}
                disabled={!igConnected}
              >
                <Text style={styles.chipText}>Also share to Instagram</Text>
              </Pressable>
              {!igConnected ? (
                <Text style={styles.muted}>Connect Instagram on Profile first.</Text>
              ) : (
                <Text style={styles.muted}>Runs after upload; needs public HTTPS media.</Text>
              )}
            </View>
            {!sellThis && (myProductsQuery.data?.items || []).length > 0 ? (
              <View style={styles.fileRow}>
                <Text style={styles.muted}>Attach product (optional)</Text>
                <View style={styles.typeRowWrap}>
                  {(myProductsQuery.data?.items || []).slice(0, 8).map((item) => {
                    const productId = Number(item.id);
                    if (!productId) {
                      return null;
                    }
                    return (
                      <Pressable
                        key={productId}
                        onPress={() => setSelectedProductId(productId)}
                        style={({ pressed }) => [
                          styles.chip,
                          selectedProductId === productId ? styles.chipActive : null,
                          compact && styles.chipCompact,
                          pressed ? styles.pressableSoft : null
                        ]}
                      >
                        <Text style={styles.chipText}>{item.title || `Product ${productId}`}</Text>
                      </Pressable>
                    );
                  })}
                  {selectedProductId ? (
                    <Pressable
                      onPress={() => setSelectedProductId(null)}
                      style={({ pressed }) => [styles.buttonSecondary, pressed && styles.pressableSoft]}
                    >
                      <Text style={styles.buttonText}>Clear</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              compact && styles.buttonCompact,
              (isSubmitting || pressed) && styles.buttonPressed
            ]}
            onPress={createPost}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonPrimaryText}>{isSubmitting ? "Publishing..." : "Publish"}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  flex: {
    flex: 1
  },
  headerBar: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    paddingHorizontal: spacing.screenHorizontal,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  headerBarCompact: {
    paddingBottom: 8,
    paddingHorizontal: 14
  },
  headerTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "700",
    flexShrink: 1
  },
  headerProductLink: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.subtleFill
  },
  headerProductLinkText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  scrollContent: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 12,
    gap: 12
  },
  scrollContentCompact: {
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 10
  },
  mediaPreview: {
    minHeight: 220,
    borderRadius: radii.panel,
    borderWidth: 1,
    borderColor: colors.mediaPreviewBorder,
    backgroundColor: colors.mediaPreviewBg,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card
  },
  mediaPreviewCompact: {
    minHeight: 176
  },
  mediaPreviewPressed: {
    opacity: 0.96
  },
  mediaPreviewFill: {
    width: "100%",
    height: 220
  },
  mediaPreviewFillCompact: {
    height: 176
  },
  mediaPlaceholder: {
    color: colors.composerMuted,
    fontSize: 15,
    padding: 20,
    textAlign: "center"
  },
  mediaPlaceholderCompact: {
    fontSize: 13,
    padding: 14
  },
  composerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radii.panel,
    padding: 14,
    gap: 10,
    ...shadows.card
  },
  composerCardCompact: {
    padding: 12,
    gap: 8
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  identityRowCompact: {
    gap: 8
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.composerBorder
  },
  avatarCompact: {
    width: 34,
    height: 34
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: colors.composerBorder,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarFallbackCompact: {
    width: 34,
    height: 34
  },
  avatarFallbackText: {
    color: colors.composerText,
    fontSize: 16,
    fontWeight: "700"
  },
  avatarFallbackTextCompact: {
    fontSize: 14
  },
  composerName: {
    flex: 1,
    color: colors.composerText,
    fontSize: 16,
    fontWeight: "700"
  },
  composerNameCompact: {
    fontSize: 15
  },
  inputComposer: {
    minHeight: 120,
    borderColor: colors.composerBorder,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.composerText,
    backgroundColor: colors.composerInputBg,
    padding: 12,
    fontSize: 16
  },
  inputComposerCompact: {
    minHeight: 92,
    padding: 10,
    fontSize: 15
  },
  inputComposerSingle: {
    borderColor: colors.composerBorder,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.composerText,
    backgroundColor: colors.composerInputBg,
    padding: 12,
    fontSize: 15
  },
  inputComposerSingleCompact: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    fontSize: 14
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginVertical: 4
  },
  dividerThin: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginVertical: 10
  },
  attachChipsScroll: { maxHeight: 48, marginBottom: 2 },
  attachChipsScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingRight: 8
  },
  promoteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  promoteRowCompact: {
    gap: 8
  },
  promoteTextBlock: {
    flex: 1,
    minWidth: 0
  },
  promoteLabel: {
    color: colors.composerText,
    fontSize: 16,
    fontWeight: "700"
  },
  promoteLabelCompact: {
    fontSize: 15
  },
  promoteHint: {
    color: colors.composerMuted,
    fontSize: 12,
    marginTop: 2
  },
  promoteHintCompact: {
    fontSize: 11
  },
  promoteFields: {
    gap: 8,
    marginTop: 4,
    paddingTop: 2
  },
  promoteFieldsCompact: {
    gap: 7,
    marginTop: 2,
    paddingTop: 0
  },
  sectionTitle: {
    color: colors.composerText,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 6
  },
  typeRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  typeRowWrapCompact: {
    gap: 6
  },
  chipLight: {
    borderColor: colors.composerBorder,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.composerInputBg
  },
  chipLightCompact: {
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  chipLightActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  chipLightText: {
    color: colors.composerText,
    fontSize: 12,
    fontWeight: "700"
  },
  chipLightTextActive: {
    color: colors.onAccent
  },
  buttonSecondaryLight: {
    borderColor: colors.composerBorder,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start",
    backgroundColor: colors.composerInputBg
  },
  buttonSecondaryLightCompact: {
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  buttonSecondaryLightText: {
    color: colors.composerText,
    fontWeight: "700",
    fontSize: 14
  },
  mutedLight: {
    color: colors.composerMuted,
    fontSize: 12
  },
  helperLight: {
    color: colors.composerMuted,
    fontSize: 11
  },
  moreSection: {
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.panel,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    padding: 12
  },
  moreSectionCompact: {
    gap: 8,
    padding: 10
  },
  moreHeading: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  chipCompact: {
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  chipActive: {
    backgroundColor: colors.subtleFill,
    borderColor: colors.accent
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700"
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radii.control,
    paddingVertical: 14,
    alignItems: "center"
  },
  buttonCompact: {
    paddingVertical: 12
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }]
  },
  buttonPrimaryText: {
    color: colors.onAccent,
    fontWeight: "700",
    fontSize: 16
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface
  },
  buttonText: {
    color: colors.text,
    fontWeight: "700"
  },
  fileRow: {
    gap: 8
  },
  muted: {
    color: colors.muted,
    fontSize: 12
  },
  error: {
    color: colors.danger
  },
  pressableSoft: {
    opacity: 0.86
  }
});
