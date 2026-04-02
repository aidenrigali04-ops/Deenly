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
  View
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { AppVideoView } from "../../components/AppVideoView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, apiRequest } from "../../lib/api";
import { fetchSessionMe } from "../../lib/auth";
import { attachProductToPost, fetchMyProducts } from "../../lib/monetization";
import { fetchInstagramStatus, requestInstagramCrossPost } from "../../lib/instagram";
import { useQuery } from "@tanstack/react-query";
import { colors } from "../../theme";
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

export function CreateScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
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
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [audienceTarget, setAudienceTarget] = useState<"b2b" | "b2c" | "both">("both");
  const [businessCategory, setBusinessCategory] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
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
    queryFn: () => fetchMyProducts()
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

      let deliveryMediaKey: string | undefined;
      if (sellThis && productType === "digital") {
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
          ctaLabel: sellThis && ctaLabel.trim() ? ctaLabel.trim() : undefined,
          ctaUrl: sellThis && ctaUrl.trim() ? ctaUrl.trim() : undefined,
          sellThis,
          audienceTarget: sellThis ? audienceTarget : "both",
          businessCategory: sellThis && businessCategory ? businessCategory : undefined,
          productType,
          priceMinor: sellThis ? Number(priceMinor) : undefined,
          productTitle: sellThis && productTitle.trim() ? productTitle.trim() : undefined,
          productDescription: sellThis && productDescription.trim() ? productDescription.trim() : undefined,
          serviceDetails: sellThis && serviceDetails.trim() ? serviceDetails.trim() : undefined,
          deliveryMethod: sellThis && deliveryMethod.trim() ? deliveryMethod.trim() : undefined,
          websiteUrl: sellThis && websiteUrl.trim() ? websiteUrl.trim() : undefined,
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
      setDeliveryMethod("");
      setWebsiteUrl("");
      setAudienceTarget("both");
      setBusinessCategory("");
      setCtaLabel("");
      setCtaUrl("");
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
      <View style={[styles.headerBar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>Create New Post</Text>
        <Pressable
          onPress={() => navigation.navigate("CreateProduct")}
          style={styles.headerProductLink}
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
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={pickMedia}
            style={styles.mediaPreview}
            accessibilityRole="button"
            accessibilityLabel="Add or change photo or video"
            accessibilityHint="Opens the file picker for an image or video"
          >
            {selectedFile && previewKind === "image" ? (
              <Image
                source={{ uri: selectedFile.uri }}
                style={styles.mediaPreviewFill}
                resizeMode="contain"
              />
            ) : null}
            {selectedFile && previewKind === "video" ? (
              <AppVideoView
                key={selectedFile.uri}
                uri={selectedFile.uri}
                style={styles.mediaPreviewFill}
                contentFit="contain"
                loop
                play
                muted
              />
            ) : null}
            {!selectedFile ? (
              <Text style={styles.mediaPlaceholder}>
                {postType === "reel" ? "Tap to add video (vertical works best)" : "Tap to add photo or video"}
              </Text>
            ) : null}
          </Pressable>

          <View style={styles.composerCard}>
            <View style={styles.identityRow}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{composerName.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.composerName} numberOfLines={1}>
                {composerName}
              </Text>
            </View>
            <TextInput
              style={styles.inputComposer}
              multiline
              placeholder="What's on your mind?"
              placeholderTextColor={colors.composerMuted}
              value={content}
              onChangeText={setContent}
              textAlignVertical="top"
              accessibilityLabel="Post caption"
            />
            <TextInput
              style={styles.inputComposerSingle}
              placeholder="Tags (comma separated)"
              placeholderTextColor={colors.composerMuted}
              value={tagsInput}
              onChangeText={setTagsInput}
            />
            <View style={styles.divider} />
            {postType !== "reel" ? (
              <>
                <View style={styles.promoteRow}>
                  <View style={styles.promoteTextBlock}>
                    <Text style={styles.promoteLabel}>Promote</Text>
                    <Text style={styles.promoteHint}>Add pricing and offer details</Text>
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
              <View style={styles.promoteFields}>
                <SectionTitle>Pricing and type</SectionTitle>
                <TextInput
                  style={styles.inputComposerSingle}
                  placeholder="Price (minor units)"
                  placeholderTextColor={colors.composerMuted}
                  value={priceMinor}
                  onChangeText={setPriceMinor}
                  keyboardType="number-pad"
                />
                <View style={styles.typeRowWrap}>
                  {(["digital", "service", "subscription"] as const).map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => setProductType(type)}
                      style={[styles.chipLight, productType === type ? styles.chipLightActive : null]}
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
                <View style={styles.typeRowWrap}>
                  {([
                    { key: "b2c", label: "Consumers" },
                    { key: "b2b", label: "Businesses" },
                    { key: "both", label: "Both" }
                  ] as const).map((item) => (
                    <Pressable
                      key={item.key}
                      onPress={() => setAudienceTarget(item.key)}
                      style={[
                        styles.chipLight,
                        audienceTarget === item.key ? styles.chipLightActive : null
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
                <View style={styles.typeRowWrap}>
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
                      style={[
                        styles.chipLight,
                        businessCategory === item.key ? styles.chipLightActive : null
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
                  style={styles.inputComposerSingle}
                  placeholder="Product title"
                  placeholderTextColor={colors.composerMuted}
                  value={productTitle}
                  onChangeText={setProductTitle}
                />
                <TextInput
                  style={styles.inputComposer}
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
                    <Pressable style={styles.buttonSecondaryLight} onPress={pickProductFile}>
                      <Text style={styles.buttonSecondaryLightText}>Upload delivery file</Text>
                    </Pressable>
                    {productFile ? (
                      <Text style={styles.mutedLight} numberOfLines={1}>
                        {productFile.name}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <TextInput
                    style={styles.inputComposer}
                    multiline
                    placeholder="Service details"
                    placeholderTextColor={colors.composerMuted}
                    value={serviceDetails}
                    onChangeText={setServiceDetails}
                    textAlignVertical="top"
                  />
                )}
                <TextInput
                  style={styles.inputComposerSingle}
                  placeholder="Delivery method (email, DM, booking call)"
                  placeholderTextColor={colors.composerMuted}
                  value={deliveryMethod}
                  onChangeText={setDeliveryMethod}
                />
                <TextInput
                  style={styles.inputComposerSingle}
                  placeholder="Website URL (https://...)"
                  placeholderTextColor={colors.composerMuted}
                  value={websiteUrl}
                  onChangeText={setWebsiteUrl}
                  autoCapitalize="none"
                />
                <SectionTitle>Call to action</SectionTitle>
                <TextInput
                  style={styles.inputComposerSingle}
                  placeholder="CTA label"
                  placeholderTextColor={colors.composerMuted}
                  value={ctaLabel}
                  onChangeText={setCtaLabel}
                  maxLength={80}
                />
                <TextInput
                  style={styles.inputComposerSingle}
                  placeholder="CTA URL (https://...)"
                  placeholderTextColor={colors.composerMuted}
                  value={ctaUrl}
                  onChangeText={setCtaUrl}
                  autoCapitalize="none"
                />
                <Text style={styles.helperLight}>Add both CTA fields or leave both empty.</Text>
              </View>
            ) : null}
              </>
            ) : (
              <Text style={styles.muted}>
                Reels use one video only. Open the Reels tab to watch full-screen reels.
              </Text>
            )}
          </View>

          <View style={styles.moreSection}>
            <Text style={styles.moreHeading}>Post type</Text>
            <View style={styles.typeRowWrap}>
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
                  style={[styles.chip, postType === type ? styles.chipActive : null, sellThis ? { opacity: 0.5 } : null]}
                >
                  <Text style={styles.chipText}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.fileRow}>
              <Pressable
                style={[styles.chip, crossPostToInstagram && igConnected ? styles.chipActive : null]}
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
            {(myProductsQuery.data?.items || []).length ? (
              <View style={styles.fileRow}>
                <Text style={styles.muted}>Attach product (optional)</Text>
                <View style={styles.typeRowWrap}>
                  {myProductsQuery.data?.items.slice(0, 4).map((item) => {
                    const product = item as { id?: number; title?: string };
                    const productId = Number(product.id || 0);
                    if (!productId) {
                      return null;
                    }
                    return (
                      <Pressable
                        key={productId}
                        onPress={() => setSelectedProductId(productId)}
                        style={[styles.chip, selectedProductId === productId ? styles.chipActive : null]}
                      >
                        <Text style={styles.chipText}>{product.title || `Product ${productId}`}</Text>
                      </Pressable>
                    );
                  })}
                  {selectedProductId ? (
                    <Pressable onPress={() => setSelectedProductId(null)} style={styles.buttonSecondary}>
                      <Text style={styles.buttonText}>Clear</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.button} onPress={createPost} disabled={isSubmitting}>
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
    backgroundColor: colors.createHeaderBar,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  headerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    flexShrink: 1
  },
  headerProductLink: {
    paddingVertical: 6,
    paddingHorizontal: 4
  },
  headerProductLinkText: {
    color: "#E8EAEF",
    fontSize: 15,
    fontWeight: "700"
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 14
  },
  mediaPreview: {
    minHeight: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.mediaPreviewBorder,
    backgroundColor: colors.mediaPreviewBg,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center"
  },
  mediaPreviewFill: {
    width: "100%",
    height: 220
  },
  mediaPlaceholder: {
    color: colors.composerMuted,
    fontSize: 15,
    padding: 20,
    textAlign: "center"
  },
  composerCard: {
    backgroundColor: colors.composerBg,
    borderRadius: 14,
    padding: 14,
    gap: 10
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.composerBorder
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: colors.composerBorder,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarFallbackText: {
    color: colors.composerText,
    fontSize: 16,
    fontWeight: "700"
  },
  composerName: {
    flex: 1,
    color: colors.composerText,
    fontSize: 16,
    fontWeight: "700"
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
  inputComposerSingle: {
    borderColor: colors.composerBorder,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.composerText,
    backgroundColor: colors.composerInputBg,
    padding: 12,
    fontSize: 15
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.composerBorder,
    marginVertical: 4
  },
  promoteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
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
  promoteHint: {
    color: colors.composerMuted,
    fontSize: 12,
    marginTop: 2
  },
  promoteFields: {
    gap: 8,
    marginTop: 4
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
  chipLight: {
    borderColor: colors.composerBorder,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.composerInputBg
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
    color: colors.text
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
    gap: 10
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
  chipActive: {
    backgroundColor: colors.accent
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700"
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center"
  },
  buttonPrimaryText: {
    color: colors.onAccent,
    fontWeight: "700",
    fontSize: 16
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
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
  }
});
