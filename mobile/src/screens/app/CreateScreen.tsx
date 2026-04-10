import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { pickVisualMedia } from "../../lib/pick-visual-media";
import { AppVideoView } from "../../components/AppVideoView";
import {
  PostPublishSuccessOverlay,
  type PostPublishVariant
} from "../../components/PostPublishSuccessOverlay";
import { AccentSwitch } from "../../components/AccentSwitch";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabScreenProps, useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, apiRequest } from "../../lib/api";
import { assistPostText } from "../../lib/ai-assist";
import { fetchSessionMe } from "../../lib/auth";
import { attachProductToPost, fetchMyProducts, type CreatorProductRow } from "../../lib/monetization";
import { fetchInstagramStatus, requestInstagramCrossPost } from "../../lib/instagram";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { colors, primaryButtonOutline, radii, shadows, spacing, type } from "../../theme";
import { resolveMediaUrl } from "../../lib/media-url";
import {
  growthExperiments,
  resolveVariant,
  shouldShowExperimentPrompt,
  trackClientExperimentEvent
} from "../../lib/experiments";
import type { AppTabParamList, CreateTabStackParamList, RootStackParamList } from "../../navigation/AppNavigator";

type CreatePostResponse = { id: number };
type UploadSignatureResponse = {
  uploadUrl: string;
  headers: Record<string, string>;
  key: string;
};
type Props = CompositeScreenProps<
  NativeStackScreenProps<CreateTabStackParamList, "CreatePost">,
  CompositeScreenProps<BottomTabScreenProps<AppTabParamList, "CreateTab">, NativeStackScreenProps<RootStackParamList>>
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
    setProductType: (v: "digital" | "service") => void;
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
  set.setProductType(pt === "digital" ? "digital" : "service");
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
  const tabBarHeight = useBottomTabBarHeight();
  const stickyBottomInset = tabBarHeight + Math.max(insets.bottom, 10) + 10;
  const [postType, setPostType] = useState<"post" | "marketplace" | "reel">("post");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [productFile, setProductFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishCelebration, setPublishCelebration] = useState<{
    postId: number;
    variant: PostPublishVariant;
  } | null>(null);
  const [error, setError] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [sellThis, setSellThis] = useState(false);
  const [productType, setProductType] = useState<"digital" | "service">("digital");
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
  const [tagsSectionOpen, setTagsSectionOpen] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [captionFocused, setCaptionFocused] = useState(false);

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
        profile_kind?: "consumer" | "professional" | "business_interest" | null;
        persona_capabilities?: {
          can_create_products?: boolean;
          can_promote_products_in_posts?: boolean;
        };
      }>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const canPromoteProducts = Boolean(profileQuery.data?.persona_capabilities?.can_promote_products_in_posts);
  const persona = profileQuery.data?.profile_kind || null;
  const financialVariant = resolveVariant(String(sessionQuery.data?.id || "anon"), growthExperiments.financialPrompt);
  const timeVariant = resolveVariant(String(sessionQuery.data?.id || "anon"), growthExperiments.timeCopy);

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

  const showListingFields = useMemo(
    () => canPromoteProducts && postType !== "reel" && (postType === "marketplace" || sellThis),
    [canPromoteProducts, postType, sellThis]
  );

  const listingInlineProduct = useMemo(
    () => showListingFields && selectedProductId == null,
    [showListingFields, selectedProductId]
  );

  const canPublish = useMemo(() => {
    if (postType === "reel") {
      const m = selectedFile?.mimeType || "";
      return Boolean(selectedFile && m.startsWith("video/"));
    }
    const hasBody = content.trim().length > 0 || Boolean(selectedFile);
    if (!hasBody) {
      return false;
    }
    if (listingInlineProduct) {
      const price = Number(priceMinor);
      if (!Number.isFinite(price) || price <= 0) {
        return false;
      }
      if (productType === "digital" && !productFile) {
        return false;
      }
    }
    return true;
  }, [postType, selectedFile, content, listingInlineProduct, priceMinor, productType, productFile]);

  const showCharCount = content.length > 280;

  const selectPostType = useCallback(
    (t: "post" | "marketplace" | "reel") => {
      setPostType(t);
      if (t === "reel") {
        setSellThis(false);
        return;
      }
      if (t === "post") {
        setSellThis(false);
        return;
      }
      if (t === "marketplace") {
        setSellThis(canPromoteProducts);
      }
    },
    [canPromoteProducts]
  );

  const handlePublishOverlayFinish = useCallback(() => {
    setPublishCelebration((c) => {
      if (c?.postId != null) {
        navigation.navigate("PostDetail", { id: c.postId });
      }
      return null;
    });
  }, [navigation]);

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

  useEffect(() => {
    if (!canPromoteProducts && sellThis) {
      setSellThis(false);
    }
  }, [canPromoteProducts, sellThis]);

  useEffect(() => {
    if (!canPromoteProducts) {
      return;
    }
    if (!shouldShowExperimentPrompt({ experimentId: growthExperiments.financialPrompt, persona })) {
      return;
    }
    void trackClientExperimentEvent({
      eventName: "offer_attach_prompt_shown",
      persona,
      source: "mobile",
      surface: "create_post",
      experimentId: growthExperiments.financialPrompt,
      variantId: financialVariant,
      properties: { variant: financialVariant }
    });
  }, [canPromoteProducts, persona, financialVariant]);

  const pickMedia = () => {
    pickVisualMedia(postType === "reel" ? { kind: "reel" } : { kind: "post" }, (asset) => {
      if (asset) {
        setSelectedFile(asset);
      }
    });
  };

  const pickProductFile = () => {
    pickVisualMedia({ kind: "product" }, (asset) => {
      if (asset) {
        setProductFile(asset);
      }
    });
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

      const meIdForPost = sessionQuery.data?.id;
      if (crossPostToInstagram && !meIdForPost) {
        throw new Error("Sign in to cross-post to Instagram.");
      }

      const inlineSellThisProduct = Boolean(sellThis && selectedProductId == null);
      if (inlineSellThisProduct && !meIdForPost) {
        throw new Error("Sign in to publish a post with a new product.");
      }
      if (selectedProductId != null && !meIdForPost) {
        throw new Error("Sign in to attach a product to your post.");
      }

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
        void trackClientExperimentEvent({
          eventName: "offer_attached_to_post",
          persona,
          source: "mobile",
          surface: "create_post",
          experimentId: growthExperiments.financialPrompt,
          variantId: financialVariant,
          properties: { postId: post.id, selectedProductId }
        });
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
      const celebrationVariant: PostPublishVariant =
        postType === "reel" ? "reel" : postType === "marketplace" ? "marketplace" : "post";
      setPublishCelebration({ postId: post.id, variant: celebrationVariant });
      void trackClientExperimentEvent({
        eventName: "task_completed",
        persona,
        source: "mobile",
        surface: "create_post",
        experimentId: growthExperiments.timeCopy,
        variantId: timeVariant,
        properties: { postId: post.id, postType, promoted: Boolean(selectedProductId) }
      });
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
          { paddingTop: insets.top + (compact ? 4 : 6) }
        ]}
      >
        <View style={styles.headerSide}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={({ pressed }) => [styles.headerBack, pressed && styles.pressableSoft]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.headerTitle}>New post</Text>
        <View style={styles.headerSide} />
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
            { paddingBottom: 20 }
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.segmentLabel}>Post type</Text>
          <View style={[styles.typeRowWrap, compact && styles.typeRowWrapCompact]}>
            {(
              [
                ["post", "Post"],
                ["marketplace", "Marketplace"],
                ["reel", "Reel"]
              ] as const
            ).map(([t, label]) => (
              <Pressable
                key={t}
                onPress={() => selectPostType(t)}
                style={({ pressed }) => [
                  styles.segmentPill,
                  postType === t ? styles.segmentPillActive : null,
                  compact && styles.segmentPillCompact,
                  pressed ? styles.pressableSoft : null
                ]}
              >
                <Text style={[styles.segmentPillText, postType === t ? styles.segmentPillTextActive : null]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.mediaWrap}>
            <Pressable
              onPress={pickMedia}
              style={({ pressed }) => [
                styles.mediaPreview,
                compact && styles.mediaPreviewCompact,
                pressed && styles.mediaPreviewPressed
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add or change photo or video"
              accessibilityHint="Choose from library, camera, or files"
            >
              {selectedFile && previewKind === "image" ? (
                <Image
                  source={{ uri: selectedFile.uri }}
                  style={[styles.mediaPreviewFill, compact && styles.mediaPreviewFillCompact]}
                  resizeMode="cover"
                />
              ) : null}
              {selectedFile && previewKind === "video" ? (
                <AppVideoView
                  key={selectedFile.uri}
                  uri={selectedFile.uri}
                  style={[styles.mediaPreviewFill, compact && styles.mediaPreviewFillCompact]}
                  contentFit="cover"
                  loop
                  play
                  muted
                />
              ) : null}
              {!selectedFile ? (
                <View style={styles.mediaEmpty}>
                  <Ionicons name="cloud-upload-outline" size={36} color={colors.accent} />
                  <Text style={styles.mediaEmptyTitle}>
                    {postType === "reel" ? "Add video" : "Add photo or video"}
                  </Text>
                  <Text style={styles.mediaEmptyHint}>
                    {postType === "reel"
                      ? "Vertical video works best for reels."
                      : postType === "marketplace"
                        ? "Strong photos help your listing stand out."
                        : "Optional for text posts"}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            {selectedFile ? (
              <View style={styles.mediaActions}>
                <Pressable
                  onPress={pickMedia}
                  style={({ pressed }) => [styles.mediaActionBtn, pressed && styles.pressableSoft]}
                >
                  <Ionicons name="image-outline" size={18} color={colors.text} />
                  <Text style={styles.mediaActionText}>Replace</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSelectedFile(null)}
                  style={({ pressed }) => [styles.mediaActionBtn, pressed && styles.pressableSoft]}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  <Text style={[styles.mediaActionText, { color: colors.danger }]}>Remove</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

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
            <Text style={styles.fieldLabel}>{postType === "marketplace" ? "Description" : "Caption"}</Text>
            <TextInput
              style={[
                styles.inputComposer,
                compact && styles.inputComposerCompact,
                captionFocused && styles.inputComposerFocused
              ]}
              multiline
              placeholder={
                postType === "marketplace" ? "Describe your listing…" : "What's on your mind?"
              }
              placeholderTextColor={colors.composerMuted}
              value={content}
              onChangeText={setContent}
              onFocus={() => setCaptionFocused(true)}
              onBlur={() => setCaptionFocused(false)}
              textAlignVertical="top"
              accessibilityLabel="Post caption"
            />
            {showCharCount ? (
              <Text style={styles.charCount}>{content.length} characters</Text>
            ) : null}

            <Pressable
              onPress={() => setTagsSectionOpen((o) => !o)}
              style={({ pressed }) => [styles.addonRow, pressed && styles.pressableSoft]}
            >
              <Ionicons name="pricetag-outline" size={20} color={colors.muted} />
              <Text style={styles.addonRowLabel}>Add tags</Text>
              {tagsInput.trim() ? (
                <Text style={styles.addonRowMeta}>{tagsInput.split(",").filter(Boolean).length}</Text>
              ) : null}
              <Ionicons name={tagsSectionOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
            </Pressable>
            {tagsSectionOpen ? (
              <View style={styles.tagsPanel}>
                <Text style={styles.tagsHelper}>Comma-separated. Used for discovery.</Text>
                <TextInput
                  style={[styles.inputComposerSingle, compact && styles.inputComposerSingleCompact]}
                  placeholder="e.g. halal, seattle, design"
                  placeholderTextColor={colors.composerMuted}
                  value={tagsInput}
                  onChangeText={setTagsInput}
                />
              </View>
            ) : null}

            <View style={styles.divider} />
            {postType === "marketplace" && !canPromoteProducts ? (
              <Text style={[styles.promoteHint, compact && styles.promoteHintCompact]}>
                Switch to Professional or Business in Settings to publish marketplace listings with pricing and delivery.
              </Text>
            ) : null}
            {postType !== "reel" && canPromoteProducts && postType === "post" ? (
              <View style={[styles.promoteRow, compact && styles.promoteRowCompact]}>
                <View style={styles.promoteTextBlock}>
                  <Text style={[styles.promoteLabel, compact && styles.promoteLabelCompact]}>Promote this post</Text>
                  <Text style={[styles.promoteHint, compact && styles.promoteHintCompact]}>
                    Add offer or pricing details for your audience
                  </Text>
                </View>
                <AccentSwitch
                  value={sellThis}
                  onValueChange={setSellThis}
                  accessibilityLabel="Promote this post"
                />
              </View>
            ) : null}
            {postType !== "reel" && canPromoteProducts && postType === "marketplace" ? (
              <View style={styles.marketplaceListingIntro}>
                <Text style={styles.marketplaceListingTitle}>Listing details</Text>
                <Text style={[styles.promoteHint, compact && styles.promoteHintCompact]}>
                  Set price, category, and delivery for a new listing, or attach an existing product from More options.
                </Text>
              </View>
            ) : null}
            {showListingFields ? (
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
                <SectionTitle>{postType === "marketplace" ? "Price & product type" : "Pricing and type"}</SectionTitle>
                {postType === "marketplace" ? (
                  <Text style={styles.priceHelper}>USD, in cents (e.g. 2500 = $25.00).</Text>
                ) : null}
                <TextInput
                  style={[styles.inputComposerSingle, compact && styles.inputComposerSingleCompact]}
                  placeholder={postType === "marketplace" ? "Price in cents" : "Price (minor units)"}
                  placeholderTextColor={colors.composerMuted}
                  value={priceMinor}
                  onChangeText={setPriceMinor}
                  keyboardType="number-pad"
                />
                <View style={[styles.typeRowWrap, compact && styles.typeRowWrapCompact]}>
                  {(["digital", "service"] as const).map((type) => (
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
                <Text style={[styles.promoteHint, compact && styles.promoteHintCompact]}>
                  For monthly recurring offers, create a Membership plan in Creator hub.
                </Text>
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
                <SectionTitle>{postType === "marketplace" ? "Title & offer copy" : "Offer copy"}</SectionTitle>
                <TextInput
                  style={[styles.inputComposerSingle, compact && styles.inputComposerSingleCompact]}
                  placeholder={postType === "marketplace" ? "Listing title" : "Product title"}
                  placeholderTextColor={colors.composerMuted}
                  value={productTitle}
                  onChangeText={setProductTitle}
                />
                <TextInput
                  style={[styles.inputComposer, compact && styles.inputComposerCompact]}
                  multiline
                  placeholder={
                    postType === "marketplace" ? "Short offer summary (shown on your product card)" : "Product or offer description"
                  }
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
                        {serviceAssistBusy ? "Generating…" : "Generate concise draft"}
                      </Text>
                    </Pressable>
                    {serviceAssistErr ? (
                      <Text style={[styles.mutedLight, { color: colors.danger }]}>{serviceAssistErr}</Text>
                    ) : null}
                    <Text style={styles.helperLight}>Edit the concise draft below before posting.</Text>
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
            {postType === "reel" ? (
              <Text style={styles.muted}>
                Reels use one video only. Open the Reels tab to watch full-screen reels.
              </Text>
            ) : !canPromoteProducts && postType === "post" ? (
              <Text style={[styles.promoteHint, compact && styles.promoteHintCompact]}>
                Switch to Professional or Business in Settings to promote posts with products.
              </Text>
            ) : null}

            <View style={styles.divider} />
            <Pressable
              onPress={() => setMoreOptionsOpen((o) => !o)}
              style={({ pressed }) => [styles.addonRow, pressed && styles.pressableSoft]}
            >
              <Ionicons name="options-outline" size={20} color={colors.muted} />
              <Text style={styles.addonRowLabel}>More options</Text>
              <View style={{ flex: 1 }} />
              <Ionicons name={moreOptionsOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
            </Pressable>
            {moreOptionsOpen ? (
              <View style={styles.moreOptionsPanel}>
                <View style={styles.crossPostBlock}>
                  <View style={styles.crossPostTop}>
                    <Ionicons name="logo-instagram" size={22} color={colors.text} />
                    <View style={styles.crossPostTitles}>
                      <Text style={styles.crossPostLabel}>Cross-post to Instagram</Text>
                      <Text style={styles.muted}>
                        {igConnected ? "Runs after upload when media is attached." : "Connect Instagram from your profile."}
                      </Text>
                    </View>
                    {igConnected ? (
                      <AccentSwitch
                        value={crossPostToInstagram}
                        onValueChange={setCrossPostToInstagram}
                      />
                    ) : (
                      <Text style={styles.crossPostStatus}>Off</Text>
                    )}
                  </View>
                </View>
                {!sellThis && (myProductsQuery.data?.items || []).length > 0 ? (
                  <View style={styles.attachProductBlock}>
                    <Text style={styles.attachProductHeading}>Attach catalog product</Text>
                    <Text style={styles.muted}>Optional — link an existing listing without creating a new product.</Text>
                    <View style={[styles.typeRowWrap, compact && styles.typeRowWrapCompact]}>
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
                            >
                              {item.title || `Product ${productId}`}
                            </Text>
                          </Pressable>
                        );
                      })}
                      {selectedProductId ? (
                        <Pressable
                          onPress={() => setSelectedProductId(null)}
                          style={({ pressed }) => [
                            styles.buttonSecondaryLight,
                            compact && styles.buttonSecondaryLightCompact,
                            pressed && styles.pressableSoft
                          ]}
                        >
                          <Text style={styles.buttonSecondaryLightText}>Clear</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <View
          style={[
            styles.stickyPublishWrap,
            compact && styles.stickyPublishWrapCompact,
            { paddingBottom: stickyBottomInset }
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.stickyPublishBtn,
              compact && styles.stickyPublishBtnCompact,
              (isSubmitting || pressed) && styles.buttonPressed,
              !canPublish && styles.stickyPublishBtnDisabled
            ]}
            onPress={createPost}
            disabled={isSubmitting || !canPublish}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.buttonPrimaryText}>Publish</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <PostPublishSuccessOverlay
        visible={publishCelebration != null}
        variant={publishCelebration?.variant ?? "post"}
        onFinish={handlePublishOverlayFinish}
      />
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
    backgroundColor: colors.background,
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
    paddingHorizontal: spacing.pagePaddingH,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48
  },
  headerBarCompact: {
    paddingBottom: 6,
    paddingHorizontal: 14
  },
  headerSide: {
    width: 40,
    alignItems: "flex-start",
    justifyContent: "center"
  },
  headerBack: {
    paddingVertical: 4,
    marginLeft: -4
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.3
  },
  scrollContent: {
    paddingHorizontal: spacing.pagePaddingH,
    paddingTop: spacing.sectionGap - 8,
    gap: spacing.sectionGap - 12
  },
  scrollContentCompact: {
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 12
  },
  segmentLabel: {
    ...type.caption,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: -4
  },
  segmentPill: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 40,
    backgroundColor: colors.surface,
    justifyContent: "center"
  },
  segmentPillCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36
  },
  segmentPillActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  segmentPillDisabled: {
    opacity: 0.4
  },
  segmentPillText: {
    ...type.button,
    fontSize: 14,
    color: colors.text
  },
  segmentPillTextActive: {
    color: colors.accent,
    fontWeight: "700"
  },
  mediaWrap: {
    gap: 10
  },
  mediaPreview: {
    minHeight: 168,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center"
  },
  mediaPreviewCompact: {
    minHeight: 140
  },
  mediaPreviewPressed: {
    opacity: 0.96
  },
  mediaPreviewFill: {
    width: "100%",
    height: 168
  },
  mediaPreviewFillCompact: {
    height: 140
  },
  mediaEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 8
  },
  mediaEmptyTitle: {
    ...type.bodyStrong,
    color: colors.text,
    textAlign: "center"
  },
  mediaEmptyHint: {
    ...type.meta,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18
  },
  mediaActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16
  },
  mediaActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingVertical: 8
  },
  mediaActionText: {
    ...type.button,
    fontSize: 14,
    color: colors.text
  },
  composerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    padding: spacing.cardPadding,
    gap: 12,
    ...shadows.card
  },
  composerCardCompact: {
    padding: 14,
    gap: 10
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  identityRowCompact: {
    gap: 10
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
    color: colors.text,
    fontSize: 15,
    fontWeight: "600"
  },
  composerNameCompact: {
    fontSize: 14
  },
  fieldLabel: {
    ...type.meta,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: -4
  },
  inputComposer: {
    minHeight: 132,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    color: colors.text,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22
  },
  inputComposerFocused: {
    borderColor: colors.accent,
    borderWidth: 1.5
  },
  inputComposerCompact: {
    minHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15
  },
  charCount: {
    ...type.metaSm,
    color: colors.mutedLight,
    alignSelf: "flex-end"
  },
  addonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingVertical: 6
  },
  addonRowLabel: {
    ...type.button,
    fontSize: 15,
    color: colors.text,
    flex: 1
  },
  addonRowMeta: {
    ...type.meta,
    color: colors.mutedLight,
    marginRight: 4
  },
  tagsPanel: {
    gap: 8,
    paddingBottom: 4
  },
  tagsHelper: {
    ...type.meta,
    color: colors.muted
  },
  inputComposerSingle: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    color: colors.text,
    backgroundColor: colors.background,
    padding: 12,
    fontSize: 15,
    minHeight: 48
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
  marketplaceListingIntro: {
    gap: 6,
    marginBottom: 4
  },
  marketplaceListingTitle: {
    ...type.sectionTitle,
    fontSize: 17,
    color: colors.text
  },
  priceHelper: {
    ...type.meta,
    color: colors.muted,
    marginTop: -4,
    marginBottom: 2
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
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
    borderWidth: 1.5,
    ...shadows.accentGlowSoft
  },
  chipLightText: {
    color: colors.composerText,
    fontSize: 12,
    fontWeight: "700"
  },
  chipLightTextActive: {
    color: colors.accent
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
  moreOptionsPanel: {
    gap: 16,
    paddingTop: 4
  },
  crossPostBlock: {
    paddingVertical: 4
  },
  crossPostTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  crossPostTitles: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  crossPostLabel: {
    ...type.button,
    fontSize: 15,
    color: colors.text
  },
  crossPostStatus: {
    ...type.meta,
    color: colors.muted
  },
  attachProductBlock: {
    gap: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  attachProductHeading: {
    ...type.meta,
    fontWeight: "600",
    color: colors.text
  },
  stickyPublishWrap: {
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingHorizontal: spacing.pagePaddingH,
    paddingTop: 12
  },
  stickyPublishWrapCompact: {
    paddingHorizontal: 14,
    paddingTop: 10
  },
  stickyPublishBtn: {
    borderRadius: radii.card,
    minHeight: 52,
    ...primaryButtonOutline
  },
  stickyPublishBtnCompact: {
    minHeight: 48
  },
  stickyPublishBtnDisabled: {
    opacity: 0.45
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
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }]
  },
  buttonPrimaryText: {
    color: colors.accent,
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
