import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { pickVisualMedia } from "../../lib/pick-visual-media";
import { AppVideoView } from "../../components/AppVideoView";
import {
  PostPublishSuccessOverlay,
  type PostPublishVariant
} from "../../components/PostPublishSuccessOverlay";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, apiRequest } from "../../lib/api";
import { assistPostText } from "../../lib/ai-assist";
import { fetchSessionMe } from "../../lib/auth";
import { attachProductToPost, fetchMyProducts, type CreatorProductRow } from "../../lib/monetization";
import { fetchInstagramStatus, requestInstagramCrossPost } from "../../lib/instagram";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveMediaUrl } from "../../lib/media-url";
import {
  growthExperiments,
  resolveVariant,
  shouldShowExperimentPrompt,
  trackClientExperimentEvent
} from "../../lib/experiments";
import type { CreateTabStackParamList, RootStackParamList } from "../../navigation/AppNavigator";
import {
  AIHelperRow,
  ComposerIdentityRow,
  CreateAppBar,
  CreateFlowSwitch,
  FormCard,
  SoftTextArea,
  SoftTextInput,
  UploadCard,
  StickyCtaBar,
  CollapsibleSection,
  ChipRow,
} from "../../components/create";
import { useCreateFlowTheme } from "../../components/ui";

/* ── Types ─────────────────────────────────────────────────── */
type CreatePostResponse = { id: number };
type UploadSignatureResponse = {
  uploadUrl: string;
  headers: Record<string, string>;
  key: string;
};
type Props = CompositeScreenProps<
  NativeStackScreenProps<CreateTabStackParamList, "CreatePost">,
  NativeStackScreenProps<RootStackParamList>
>;

function deriveMediaType(mimeType: string): "image" | "video" | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
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

/* ── Component ─────────────────────────────────────────────── */
export function CreateScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const cf = useCreateFlowTheme();
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

  /* ── Queries ── */
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
    if (p?.display_name?.trim()) return p.display_name.trim();
    if (s?.username?.trim()) return s.username.trim();
    if (s?.email) return s.email.split("@")[0] || "You";
    return "You";
  }, [profileQuery.data, sessionQuery.data]);

  const avatarUri = resolveMediaUrl(profileQuery.data?.avatar_url) || undefined;

  const previewMime = useMemo(() => {
    if (!selectedFile) return null;
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
    if (!hasBody) return false;
    if (listingInlineProduct) {
      const price = Number(priceMinor);
      if (!Number.isFinite(price) || price <= 0) return false;
      if (productType === "digital" && !productFile) return false;
    }
    return true;
  }, [postType, selectedFile, content, listingInlineProduct, priceMinor, productType, productFile]);

  const selectPostType = useCallback(
    (t: "post" | "marketplace" | "reel") => {
      setPostType(t);
      if (t === "reel") { setSellThis(false); return; }
      if (t === "post") { setSellThis(false); return; }
      if (t === "marketplace") setSellThis(canPromoteProducts);
    },
    [canPromoteProducts]
  );

  const handlePublishOverlayFinish = useCallback(() => {
    setPublishCelebration((c) => {
      if (c?.postId != null) navigation.navigate("PostDetail", { id: c.postId });
      return null;
    });
  }, [navigation]);

  /* ── Side effects ── */
  useEffect(() => { if (sellThis) setPostType("marketplace"); }, [sellThis]);
  useEffect(() => { if (postType === "reel") setSellThis(false); }, [postType]);
  useEffect(() => { if (!canPromoteProducts && sellThis) setSellThis(false); }, [canPromoteProducts, sellThis]);

  useEffect(() => {
    if (!canPromoteProducts) return;
    if (!shouldShowExperimentPrompt({ experimentId: growthExperiments.financialPrompt, persona })) return;
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

  /* ── Handlers ── */
  const pickMedia = () => {
    pickVisualMedia(postType === "reel" ? { kind: "reel" } : { kind: "post" }, (asset) => {
      if (asset) setSelectedFile(asset);
    });
  };

  const pickProductFile = () => {
    pickVisualMedia({ kind: "product" }, (asset) => {
      if (asset) setProductFile(asset);
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
      ].filter(Boolean).join("\n");
      const res = await assistPostText(lines, "service_details_generate");
      setServiceDetails(res.suggestion);
    } catch (e) {
      setServiceAssistErr(e instanceof ApiError ? e.message : "Could not generate.");
    } finally {
      setServiceAssistBusy(false);
    }
  };

  /* ── Publish ── */
  const createPost = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      if (postType === "reel") {
        if (!selectedFile) throw new Error("Select a video for your reel.");
        const m = selectedFile.mimeType || "";
        if (!m.startsWith("video/")) throw new Error("Reels require a video file.");
      }
      if (crossPostToInstagram && !selectedFile) throw new Error("Attach image or video to cross-post to Instagram.");
      const meIdForPost = sessionQuery.data?.id;
      if (crossPostToInstagram && !meIdForPost) throw new Error("Sign in to cross-post to Instagram.");
      const inlineSellThisProduct = Boolean(sellThis && selectedProductId == null);
      if (inlineSellThisProduct && !meIdForPost) throw new Error("Sign in to publish a post with a new product.");
      if (selectedProductId != null && !meIdForPost) throw new Error("Sign in to attach a product to your post.");

      let deliveryMediaKey: string | undefined;
      if (inlineSellThisProduct && productType === "digital") {
        if (!productFile) throw new Error("Select a delivery file for digital product.");
        const productMimeType = productFile.mimeType || "application/octet-stream";
        const productMediaType = deriveMediaType(productMimeType);
        if (!productMediaType) throw new Error("Digital delivery file must be image or video.");
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
        if (!productUploadResponse.ok) throw new Error("Unable to upload product delivery file.");
        deliveryMediaKey = signature.key;
      }

      const post = await apiRequest<CreatePostResponse>("/posts", {
        method: "POST",
        auth: true,
        body: {
          postType,
          content,
          tags: tagsInput.split(",").map((tag) => tag.trim()).filter(Boolean),
          isBusinessPost: sellThis,
          sellThis: inlineSellThisProduct,
          audienceTarget: sellThis ? audienceTarget : "both",
          businessCategory: sellThis && businessCategory ? businessCategory : undefined,
          productType,
          priceMinor: inlineSellThisProduct ? Number(priceMinor) : undefined,
          productTitle: inlineSellThisProduct && productTitle.trim() ? productTitle.trim() : undefined,
          productDescription: inlineSellThisProduct && productDescription.trim() ? productDescription.trim() : undefined,
          serviceDetails: inlineSellThisProduct && serviceDetails.trim() ? serviceDetails.trim() : undefined,
          deliveryMethod: inlineSellThisProduct && deliveryMethod.trim() ? deliveryMethod.trim() : undefined,
          websiteUrl: inlineSellThisProduct && websiteUrl.trim() ? websiteUrl.trim() : undefined,
          deliveryMediaKey,
          ...(postType === "reel" && selectedFile ? { mediaMimeType: selectedFile.mimeType || "video/mp4" } : {})
        }
      });

      if (selectedFile) {
        const fallbackMime = selectedFile.name?.toLowerCase().match(/\.(png|jpe?g|webp|gif)$/) ? "image/jpeg" : "video/mp4";
        const mimeType = selectedFile.mimeType || fallbackMime;
        const mediaType = deriveMediaType(mimeType);
        if (!mediaType) throw new Error("Only image and video uploads are supported.");

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
        if (!uploadResponse.ok) throw new Error("Unable to upload selected media.");

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
          try { await requestInstagramCrossPost(post.id); } catch { /* non-blocking */ }
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

  /* ── Derived ── */
  const isReel = postType === "reel";
  const ctaLabel = isReel ? "Publish reel" : "Publish";
  const uploadHeight = isReel ? 280 : 230;
  const uploadTitle = isReel ? "Reel video" : "Photo or video";
  const uploadHint = isReel
    ? "Vertical 9:16 works best. Tap to choose from your library."
    : postType === "marketplace"
      ? "Add clear photos or a short clip so buyers can see what they get."
      : "Optional for text-only posts — tap to pick from your library.";

  /* ── Render ── */
  return (
    <View style={cf.layout}>
      <CreateAppBar title="New post" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[cf.scrollContent, { paddingBottom: insets.bottom + 110 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Post type selector ── */}
          <View style={cf.segmentTrack}>
            {(
              [
                ["post", "Post"],
                ["marketplace", "Marketplace"],
                ["reel", "Reel"]
              ] as const
            ).map(([tk, label]) => {
              const active = postType === tk;
              return (
                <Pressable
                  key={tk}
                  onPress={() => selectPostType(tk)}
                  style={[cf.segmentPill, active ? cf.segmentPillActive : cf.segmentPillIdle]}
                >
                  <Text style={active ? cf.segmentTextActive : cf.segmentTextIdle}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[cf.card, { padding: 16, gap: 8 }]} accessibilityLabel="How creating a post works">
            <Text style={[cf.sectionTitle, { fontSize: 16, marginBottom: 2 }]}>How it works</Text>
            <Text style={cf.helper}>1. Choose Post, Marketplace, or Reel above.</Text>
            <Text style={cf.helper}>2. Add media (recommended for reels and listings).</Text>
            <Text style={cf.helper}>3. Write your caption or description, then publish.</Text>
          </View>

          {/* ── Media upload ── */}
          <UploadCard
            height={uploadHeight}
            uri={selectedFile?.uri}
            mimeType={previewMime}
            isVideo={previewKind === "video"}
            title={uploadTitle}
            hint={uploadHint}
            icon="cloud-upload-outline"
            onPress={pickMedia}
            onReplace={selectedFile ? pickMedia : undefined}
            onRemove={selectedFile ? () => setSelectedFile(null) : undefined}
          />

          {/* ── Reel: cover selection placeholder ── */}
          {isReel && selectedFile ? (
            <View style={cf.inlineHintRow}>
              <Ionicons name="film-outline" size={18} color={cf.f.textMuted} />
              <Text style={cf.canvasHelper}>Cover frame auto-selected from first frame</Text>
            </View>
          ) : null}

          {/* ── Composer card ── */}
          <FormCard>
            {/* Identity row */}
            <ComposerIdentityRow avatarUri={avatarUri} displayName={composerName} />

            <SoftTextArea
              label={postType === "marketplace" ? "Description" : "Caption"}
              placeholder={postType === "marketplace" ? "Describe your listing..." : "What's on your mind?"}
              value={content}
              onChangeText={setContent}
              minHeight={isReel ? 80 : 120}
            />
            {content.length > 280 ? (
              <Text style={cf.helperSmall}>{content.length} characters</Text>
            ) : null}
          </FormCard>

          {/* ── Promote toggle (post mode, if eligible) ── */}
          {postType === "post" && canPromoteProducts ? (
            <FormCard>
              <View style={cf.promoteRow}>
                <View style={cf.promoteTextWrap}>
                  <Text style={cf.promoteTitle}>Promote this post</Text>
                  <Text style={cf.helper}>Add offer or pricing details</Text>
                </View>
                <CreateFlowSwitch
                  value={sellThis}
                  onValueChange={setSellThis}
                  accessibilityLabel="Promote this post"
                />
              </View>
            </FormCard>
          ) : null}

          {/* ── Marketplace listing header ── */}
          {postType === "marketplace" && canPromoteProducts ? (
            <FormCard>
              <Text style={cf.sectionTitle}>Listing details</Text>
              <Text style={cf.helper}>
                Set price, category, and delivery for a new listing, or attach an existing product from More options.
              </Text>
            </FormCard>
          ) : null}

          {/* ── Listing fields (marketplace / promoted) ── */}
          {showListingFields ? (
            <FormCard>
              {/* Attach catalog product chips */}
              {(myProductsQuery.data?.items || []).length > 0 ? (
                <>
                  <Text style={cf.upperLabel}>Attach catalog product</Text>
                  <Text style={cf.helper}>
                    Choose a listing first — pricing, type, and delivery pre-fill from that product.
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={cf.chipScrollRow}
                  >
                    {(myProductsQuery.data?.items || []).map((item) => {
                      const pid = Number(item.id);
                      if (!pid) return null;
                      return (
                        <Pressable
                          key={pid}
                          onPress={() => {
                            setSelectedProductId(pid);
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
                          style={[cf.chip, selectedProductId === pid && cf.chipActive]}
                        >
                          <Text
                            style={[cf.chipText, selectedProductId === pid && cf.chipTextActive]}
                            numberOfLines={1}
                          >
                            {item.title || `Product ${pid}`}
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
                      style={cf.textLinkPressable}
                    >
                      <Text style={cf.secondaryCtaLabel}>Clear attached product</Text>
                    </Pressable>
                  ) : null}
                  <View style={cf.hairlineDivider} />
                </>
              ) : null}

              {/* Price & type */}
              <Text style={cf.upperLabel}>Price & product type</Text>
              {postType === "marketplace" ? (
                <Text style={cf.helper}>USD, in cents (e.g. 2500 = $25.00).</Text>
              ) : null}
              <SoftTextInput
                placeholder={postType === "marketplace" ? "Price in cents" : "Price (minor units)"}
                value={priceMinor}
                onChangeText={setPriceMinor}
                keyboardType="number-pad"
              />
              <ChipRow
                items={[
                  { key: "digital", label: "Digital" },
                  { key: "service", label: "Service" },
                ]}
                selected={productType}
                onSelect={(k) => setProductType(k as "digital" | "service")}
              />

              {/* Audience */}
              <Text style={cf.upperLabel}>Who it is for</Text>
              <ChipRow
                items={[
                  { key: "b2c", label: "Consumers" },
                  { key: "b2b", label: "Businesses" },
                  { key: "both", label: "Both" },
                ]}
                selected={audienceTarget}
                onSelect={(k) => setAudienceTarget(k as "b2b" | "b2c" | "both")}
              />

              {/* Category */}
              <Text style={cf.upperLabel}>Category</Text>
              <ChipRow
                wrap
                items={[
                  { key: "tools_growth", label: "Tools" },
                  { key: "professional_services", label: "Services" },
                  { key: "digital_products", label: "Digital" },
                  { key: "education_coaching", label: "Coaching" },
                  { key: "lifestyle_inspiration", label: "Lifestyle" },
                ]}
                selected={businessCategory}
                onSelect={setBusinessCategory}
              />

              {/* Title & description */}
              <Text style={cf.upperLabel}>Title & offer copy</Text>
              <SoftTextInput
                placeholder={postType === "marketplace" ? "Listing title" : "Product title"}
                value={productTitle}
                onChangeText={setProductTitle}
              />
              <SoftTextArea
                placeholder={postType === "marketplace" ? "Short offer summary" : "Product description"}
                value={productDescription}
                onChangeText={setProductDescription}
                minHeight={80}
              />

              {/* Delivery */}
              <Text style={cf.upperLabel}>Delivery</Text>
              {productType === "digital" ? (
                <View style={{ gap: 8 }}>
                  {selectedProductId ? (
                    <Text style={cf.helper}>
                      Delivery media is stored on the attached catalog product — no upload needed.
                    </Text>
                  ) : (
                    <>
                      <Pressable style={cf.surfaceTextButtonLeading} onPress={pickProductFile}>
                        <Ionicons name="cloud-upload-outline" size={18} color={cf.f.accentGold} />
                        <Text style={cf.surfaceTextButtonLabel}>Upload delivery file</Text>
                      </Pressable>
                      {productFile ? (
                        <Text style={cf.helper} numberOfLines={1}>{productFile.name}</Text>
                      ) : null}
                    </>
                  )}
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <SoftTextArea
                    placeholder="Key points — what you offer, who it is for..."
                    value={serviceKeyPoints}
                    onChangeText={setServiceKeyPoints}
                    minHeight={80}
                  />
                  <AIHelperRow
                    label="Generate concise draft"
                    onPress={() => void generateServiceDescriptionForSell()}
                    busy={serviceAssistBusy}
                  />
                  {serviceAssistErr ? <Text style={cf.errorSmall}>{serviceAssistErr}</Text> : null}
                  <SoftTextArea
                    placeholder="Service description & value proposition"
                    value={serviceDetails}
                    onChangeText={setServiceDetails}
                    minHeight={80}
                  />
                </View>
              )}
              <SoftTextInput
                placeholder="Delivery method (email, DM, booking call)"
                value={deliveryMethod}
                onChangeText={setDeliveryMethod}
              />
              <SoftTextInput
                placeholder="Website URL (https://...)"
                value={websiteUrl}
                onChangeText={setWebsiteUrl}
                autoCapitalize="none"
              />
            </FormCard>
          ) : null}

          {/* ── Reel hint ── */}
          {isReel ? (
            <Text style={cf.canvasHelper}>
              Reels use one video only. Open the Reels tab to watch full-screen reels.
            </Text>
          ) : null}

          {/* ── More options (collapsed) ── */}
          <FormCard>
            <CollapsibleSection title="More options">
              {/* Tags */}
              <View style={cf.settingsRow}>
                <Ionicons name="pricetag-outline" size={20} color={cf.panelIconMuted} />
                <Text style={[cf.settingsRowTitle, { flex: 1 }]}>Tags</Text>
                {tagsInput.trim() ? (
                  <Text style={cf.helperSmall}>{tagsInput.split(",").filter(Boolean).length}</Text>
                ) : null}
              </View>
              <SoftTextInput
                placeholder="e.g. halal, seattle, design (comma-separated)"
                value={tagsInput}
                onChangeText={setTagsInput}
              />

              {/* Instagram cross-post */}
              <View style={cf.settingsRow}>
                <Ionicons name="logo-instagram" size={22} color={cf.panelIconMuted} />
                <View style={cf.settingsRowTextCol}>
                  <Text style={cf.settingsRowTitle}>Cross-post to Instagram</Text>
                  <Text style={cf.helper}>
                    {igConnected ? "Runs after upload when media is attached." : "Connect Instagram from your profile."}
                  </Text>
                </View>
                {igConnected ? (
                  <CreateFlowSwitch value={crossPostToInstagram} onValueChange={setCrossPostToInstagram} />
                ) : (
                  <Text style={cf.helper}>Off</Text>
                )}
              </View>

              {/* Attach product from more options (non-sell mode) */}
              {!sellThis && postType !== "reel" && (myProductsQuery.data?.items || []).length > 0 ? (
                <>
                  <View style={cf.hairlineDivider} />
                  <Text style={cf.upperLabel}>Attach catalog product</Text>
                  <Text style={cf.helper}>Optional — link an existing listing without creating a new product.</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={cf.chipScrollRow}
                  >
                    {(myProductsQuery.data?.items || []).slice(0, 8).map((item) => {
                      const pid = Number(item.id);
                      if (!pid) return null;
                      return (
                        <Pressable
                          key={pid}
                          onPress={() => setSelectedProductId(pid)}
                          style={[cf.chip, selectedProductId === pid && cf.chipActive]}
                        >
                          <Text
                            style={[cf.chipText, selectedProductId === pid && cf.chipTextActive]}
                            numberOfLines={1}
                          >
                            {item.title || `Product ${pid}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  {selectedProductId ? (
                    <Pressable onPress={() => setSelectedProductId(null)} style={cf.textLinkPressable}>
                      <Text style={cf.secondaryCtaLabel}>Clear</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </CollapsibleSection>
          </FormCard>

          {error ? <Text style={cf.error}>{error}</Text> : null}
        </ScrollView>

        {/* ── Sticky CTA ── */}
        <StickyCtaBar
          primaryLabel={ctaLabel}
          onPrimary={createPost}
          primaryDisabled={!canPublish}
          primaryLoading={isSubmitting}
        />
      </KeyboardAvoidingView>

      <PostPublishSuccessOverlay
        visible={publishCelebration != null}
        variant={publishCelebration?.variant ?? "post"}
        onFinish={handlePublishOverlayFinish}
      />
    </View>
  );
}

