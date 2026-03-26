import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, apiRequest } from "../../lib/api";
import { attachProductToPost, fetchMyProducts } from "../../lib/monetization";
import { useQuery } from "@tanstack/react-query";
import { colors } from "../../theme";
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

export function CreateScreen({ navigation }: Props) {
  const [postType, setPostType] = useState<"community" | "recitation" | "short_video">(
    "community"
  );
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
  const myProductsQuery = useQuery({
    queryKey: ["mobile-create-my-products"],
    queryFn: () => fetchMyProducts()
  });

  const pickMedia = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "video/*"],
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
          deliveryMediaKey
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
      navigation.navigate("PostDetail", { id: post.id });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to create post";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Create Post</Text>
      <View style={styles.typeRow}>
        {(["community", "recitation", "short_video"] as const).map((type) => (
          <Pressable
            key={type}
            onPress={() => setPostType(type)}
            style={[styles.chip, postType === type ? styles.chipActive : null]}
          >
            <Text style={styles.chipText}>{type}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        multiline
        placeholder="Share your message..."
        placeholderTextColor={colors.muted}
        value={content}
        onChangeText={setContent}
      />
      <TextInput
        style={styles.inputSingle}
        placeholder="Tags (comma separated)"
        placeholderTextColor={colors.muted}
        value={tagsInput}
        onChangeText={setTagsInput}
      />
      <View style={styles.fileRow}>
        <Pressable style={styles.buttonSecondary} onPress={pickMedia}>
          <Text style={styles.buttonText}>Attach media</Text>
        </Pressable>
        {selectedFile ? (
          <Text style={styles.muted} numberOfLines={1}>
            {selectedFile.name}
          </Text>
        ) : (
          <Text style={styles.muted}>Optional: image/video upload</Text>
        )}
      </View>
      {(myProductsQuery.data?.items || []).length ? (
        <View style={styles.fileRow}>
          <Text style={styles.muted}>Attach product (optional)</Text>
          <View style={styles.typeRow}>
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
      <View style={styles.fileRow}>
        <Pressable
          style={[styles.chip, sellThis ? styles.chipActive : null]}
          onPress={() => setSellThis((value) => !value)}
        >
          <Text style={styles.chipText}>Sell This</Text>
        </Pressable>
        {sellThis ? (
          <>
            <TextInput
              style={styles.inputSingle}
              placeholder="Price (minor units)"
              placeholderTextColor={colors.muted}
              value={priceMinor}
              onChangeText={setPriceMinor}
              keyboardType="number-pad"
            />
            <View style={styles.typeRow}>
              {(["digital", "service", "subscription"] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setProductType(type)}
                  style={[styles.chip, productType === type ? styles.chipActive : null]}
                >
                  <Text style={styles.chipText}>{type}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.typeRow}>
              {([
                { key: "b2c", label: "Consumers" },
                { key: "b2b", label: "Businesses" },
                { key: "both", label: "Both" }
              ] as const).map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => setAudienceTarget(item.key)}
                  style={[styles.chip, audienceTarget === item.key ? styles.chipActive : null]}
                >
                  <Text style={styles.chipText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.typeRow}>
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
                  style={[styles.chip, businessCategory === item.key ? styles.chipActive : null]}
                >
                  <Text style={styles.chipText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.inputSingle}
              placeholder="Product title"
              placeholderTextColor={colors.muted}
              value={productTitle}
              onChangeText={setProductTitle}
            />
            <TextInput
              style={styles.input}
              multiline
              placeholder="Product / offer description"
              placeholderTextColor={colors.muted}
              value={productDescription}
              onChangeText={setProductDescription}
            />
            {productType === "digital" ? (
              <View style={styles.fileRow}>
                <Pressable style={styles.buttonSecondary} onPress={pickProductFile}>
                  <Text style={styles.buttonText}>Upload delivery file</Text>
                </Pressable>
                {productFile ? (
                  <Text style={styles.muted} numberOfLines={1}>
                    {productFile.name}
                  </Text>
                ) : null}
              </View>
            ) : (
              <TextInput
                style={styles.input}
                multiline
                placeholder="Service details"
                placeholderTextColor={colors.muted}
                value={serviceDetails}
                onChangeText={setServiceDetails}
              />
            )}
            <TextInput
              style={styles.inputSingle}
              placeholder="Delivery method (email, DM, booking call)"
              placeholderTextColor={colors.muted}
              value={deliveryMethod}
              onChangeText={setDeliveryMethod}
            />
            <TextInput
              style={styles.inputSingle}
              placeholder="Website URL (https://...)"
              placeholderTextColor={colors.muted}
              value={websiteUrl}
              onChangeText={setWebsiteUrl}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.inputSingle}
              placeholder="CTA label"
              placeholderTextColor={colors.muted}
              value={ctaLabel}
              onChangeText={setCtaLabel}
              maxLength={80}
            />
            <TextInput
              style={styles.inputSingle}
              placeholder="CTA URL (https://...)"
              placeholderTextColor={colors.muted}
              value={ctaUrl}
              onChangeText={setCtaUrl}
              autoCapitalize="none"
            />
          </>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={createPost} disabled={isSubmitting}>
        <Text style={styles.buttonPrimaryText}>{isSubmitting ? "Publishing..." : "Publish"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 14,
    gap: 12
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700"
  },
  typeRow: {
    flexDirection: "row",
    gap: 8
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
  input: {
    minHeight: 150,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: 12,
    textAlignVertical: "top"
  },
  inputSingle: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: 12
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonText: {
    color: colors.text,
    fontWeight: "700"
  },
  buttonPrimaryText: {
    color: colors.background,
    fontWeight: "700"
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
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
