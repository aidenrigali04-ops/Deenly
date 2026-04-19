import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { pickVisualMedia } from "../../lib/pick-visual-media";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../lib/api";
import { assistPostText } from "../../lib/ai-assist";
import {
  createProduct,
  publishProduct,
  createTier,
  publishTier,
  patchProduct,
  fetchMyProducts,
  fetchMyProductById,
  fetchConnectStatus,
  fetchStripeProductImportList,
  importProductDraftFromStripe,
  importProductDraftFromStripeProductId,
  estimateCreatorNet,
  formatMinorCurrency,
  type CreatorProductDetail,
  type MonetizationBoostTier,
  type ProductImportDraft,
  type StripeProductImportRow
} from "../../lib/monetization";
import { useCreateFlowTheme } from "../../components/ui";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import {
  CreateAppBar,
  FormCard,
  SoftTextInput,
  SoftTextArea,
  StickyCtaBar,
  UploadCard,
  ChipRow,
  EarningsPreviewCard,
  CollapsibleSection,
  SubtypeSegmentedControl,
  AIHelperRow,
} from "../../components/create";

/* ── Types ─────────────────────────────────────────────────── */
type UploadSignatureResponse = {
  uploadUrl: string;
  headers: Record<string, string>;
  key: string;
};
type Props = NativeStackScreenProps<RootStackParamList, "CreateProduct">;
type EditableProductType = "digital" | "service";

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

function applyDraftToForm(
  draft: ProductImportDraft,
  set: {
    setTitle: (v: string) => void;
    setDescription: (v: string) => void;
    setCurrency: (v: string) => void;
    setPriceUsd: (v: string) => void;
    setPriceMinorOnly: (v: string) => void;
    setUseMinorPrice: (v: boolean) => void;
    setProductType: (v: EditableProductType) => void;
    setWebsiteUrl: (v: string) => void;
    setServiceDetails: (v: string) => void;
    setDeliveryMethod: (v: string) => void;
    setAudienceTarget: (v: "b2b" | "b2c" | "both") => void;
    setBusinessCategory: (v: string) => void;
  }
) {
  set.setTitle(draft.title);
  set.setDescription(draft.description || "");
  const cur = (draft.currency || "usd").toLowerCase().slice(0, 3);
  set.setCurrency(cur);
  if (cur === "usd") {
    set.setUseMinorPrice(false);
    set.setPriceUsd((draft.priceMinor / 100).toFixed(2));
    set.setPriceMinorOnly("");
  } else {
    set.setUseMinorPrice(true);
    set.setPriceMinorOnly(String(draft.priceMinor));
    set.setPriceUsd("");
  }
  set.setProductType(draft.productType === "digital" ? "digital" : "service");
  set.setWebsiteUrl(draft.websiteUrl || "");
  set.setServiceDetails(draft.serviceDetails || "");
  set.setDeliveryMethod(draft.deliveryMethod || "");
  set.setAudienceTarget(
    draft.audienceTarget === "b2b" || draft.audienceTarget === "b2c" || draft.audienceTarget === "both"
      ? draft.audienceTarget
      : "both"
  );
  set.setBusinessCategory(draft.businessCategory || "");
}

function normalizeBoostTier(raw: string | null | undefined): MonetizationBoostTier {
  const t = (raw || "standard").toLowerCase();
  if (t === "boosted" || t === "aggressive") return t;
  return "standard";
}

const BOOST_TIER_BPS: Record<MonetizationBoostTier, number> = {
  standard: 350,
  boosted: 2000,
  aggressive: 3500
};

function applyProductDetailToForm(
  p: CreatorProductDetail,
  set: {
    setTitle: (v: string) => void;
    setDescription: (v: string) => void;
    setCurrency: (v: string) => void;
    setPriceUsd: (v: string) => void;
    setPriceMinorOnly: (v: string) => void;
    setUseMinorPrice: (v: boolean) => void;
    setProductType: (v: EditableProductType) => void;
    setWebsiteUrl: (v: string) => void;
    setServiceDetails: (v: string) => void;
    setDeliveryMethod: (v: string) => void;
    setAudienceTarget: (v: "b2b" | "b2c" | "both") => void;
    setBusinessCategory: (v: string) => void;
    setBoostTier: (v: MonetizationBoostTier) => void;
    setHasRemoteDelivery: (v: boolean) => void;
    setDeliveryFile: (v: DocumentPicker.DocumentPickerAsset | null) => void;
    setSavedDraftId: (v: number | null) => void;
  }
) {
  set.setTitle(p.title);
  set.setDescription(p.description || "");
  const cur = (p.currency || "usd").toLowerCase().slice(0, 3);
  set.setCurrency(cur);
  if (cur === "usd") {
    set.setUseMinorPrice(false);
    set.setPriceUsd((p.price_minor / 100).toFixed(2));
    set.setPriceMinorOnly("");
  } else {
    set.setUseMinorPrice(true);
    set.setPriceMinorOnly(String(p.price_minor));
    set.setPriceUsd("");
  }
  set.setProductType(p.product_type === "digital" ? "digital" : "service");
  set.setWebsiteUrl(p.website_url || "");
  set.setServiceDetails(p.service_details || "");
  set.setDeliveryMethod(p.delivery_method || "");
  const at = p.audience_target;
  if (at === "b2b" || at === "b2c" || at === "both") {
    set.setAudienceTarget(at);
  } else {
    set.setAudienceTarget("both");
  }
  set.setBusinessCategory(p.business_category || "");
  set.setBoostTier(normalizeBoostTier(p.boost_tier));
  set.setHasRemoteDelivery(Boolean(p.delivery_media_key));
  set.setDeliveryFile(null);
  set.setSavedDraftId(p.id);
}

/* ── Success overlay ─────────────────────────────────────── */
function SuccessCheckOverlay({
  visible,
  title,
  subtitle
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
}) {
  const cf = useCreateFlowTheme();
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) { scale.setValue(0); fade.setValue(0); return; }
    fade.setValue(0);
    scale.setValue(0);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 100, useNativeDriver: true })
    ]).start();
  }, [visible, fade, scale]);

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View style={[styles.overlayBackdrop, { opacity: fade }]}>
        <View
          style={{
            alignItems: "center",
            maxWidth: 300,
            width: "100%",
            paddingVertical: 32,
            paddingHorizontal: 24,
            borderRadius: cf.f.cardRadiusMd,
            backgroundColor: cf.f.createFlowPanel ?? "#FFFFFF",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: cf.f.createFlowPanelBorder ?? "rgba(10,10,11,0.1)"
          }}
        >
          <Animated.View
            style={[
              {
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: "rgba(254,177,1,0.22)",
                borderWidth: 2,
                borderColor: cf.f.accentGold,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16
              },
              { transform: [{ scale }] }
            ]}
          >
            <Text style={{ fontSize: 36, color: cf.f.accentGold, fontWeight: "700" as const }}>✓</Text>
          </Animated.View>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600" as const,
              color: cf.f.createFlowInk ?? "#0A0A0B",
              textAlign: "center"
            }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{
                fontSize: 14,
                color: cf.f.createFlowInkMuted ?? "rgba(10,10,11,0.55)",
                textAlign: "center",
                marginTop: 10,
                lineHeight: 21
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </Modal>
  );
}

/* ── Main component ──────────────────────────────────────── */
type ListingKind = "product" | "membership";

export function CreateProductScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const cf = useCreateFlowTheme();
  const queryClient = useQueryClient();
  const appliedInitialDraft = useRef(false);
  const [listingKind, setListingKind] = useState<ListingKind>("product");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [priceMinorOnly, setPriceMinorOnly] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [useMinorPrice, setUseMinorPrice] = useState(false);
  const [productType, setProductType] = useState<EditableProductType>("digital");
  const [audienceTarget, setAudienceTarget] = useState<"b2b" | "b2c" | "both">("both");
  const [businessCategory, setBusinessCategory] = useState("");
  const [boostTier, setBoostTier] = useState<MonetizationBoostTier>("standard");
  const [serviceDetails, setServiceDetails] = useState("");
  const [serviceKeyPoints, setServiceKeyPoints] = useState("");
  const [serviceAssistBusy, setServiceAssistBusy] = useState(false);
  const [serviceAssistErr, setServiceAssistErr] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [deliveryFile, setDeliveryFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [hasRemoteDelivery, setHasRemoteDelivery] = useState(false);
  const [formError, setFormError] = useState("");
  const [savedDraftId, setSavedDraftId] = useState<number | null>(null);
  const [successKind, setSuccessKind] = useState<"draft" | "added" | null>(null);
  const [stripeItems, setStripeItems] = useState<StripeProductImportRow[]>([]);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripePickBusy, setStripePickBusy] = useState(false);
  const [stripeProductIdInput, setStripeProductIdInput] = useState("");
  const [importNotice, setImportNotice] = useState("");

  const editProductId = route.params?.editProductId;

  const appBarTitle = useMemo(() => {
    if (editProductId) return "Edit product";
    if (listingKind === "membership") return "Membership";
    return "Add product";
  }, [editProductId, listingKind]);

  /* ── Initial draft hydration ── */
  useEffect(() => {
    const d = route.params?.initialDraft;
    if (editProductId || !d || appliedInitialDraft.current) return;
    appliedInitialDraft.current = true;
    applyDraftToForm(d, {
      setTitle, setDescription, setCurrency, setPriceUsd, setPriceMinorOnly,
      setUseMinorPrice, setProductType, setWebsiteUrl, setServiceDetails,
      setDeliveryMethod, setAudienceTarget, setBusinessCategory
    });
  }, [route.params?.initialDraft, editProductId]);

  const hydratedEditId = useRef<number | null>(null);
  useEffect(() => { hydratedEditId.current = null; }, [editProductId]);

  const { data: editRow, isLoading: editLoading, isError: editError } = useQuery({
    queryKey: ["creator-product-edit", editProductId],
    queryFn: () => fetchMyProductById(editProductId!),
    enabled: Boolean(editProductId && editProductId > 0)
  });

  useEffect(() => {
    if (!editProductId || !editRow || hydratedEditId.current === editProductId) return;
    if (editRow.status !== "draft") { hydratedEditId.current = editProductId; return; }
    hydratedEditId.current = editProductId;
    applyProductDetailToForm(editRow, {
      setTitle, setDescription, setCurrency, setPriceUsd, setPriceMinorOnly,
      setUseMinorPrice, setProductType, setWebsiteUrl, setServiceDetails,
      setDeliveryMethod, setAudienceTarget, setBusinessCategory,
      setBoostTier, setHasRemoteDelivery, setDeliveryFile, setSavedDraftId
    });
  }, [editProductId, editRow]);

  /* ── Queries ── */
  const { data: myProducts } = useQuery({
    queryKey: ["mobile-create-my-products"],
    queryFn: () => fetchMyProducts({ limit: 50 })
  });
  const { data: connectStatus } = useQuery({
    queryKey: ["mobile-create-connect-status"],
    queryFn: () => fetchConnectStatus()
  });
  const capsQuery = useQuery({
    queryKey: ["mobile-create-product-caps"],
    queryFn: () =>
      apiRequest<{
        persona_capabilities?: { can_create_products?: boolean; can_manage_memberships?: boolean };
      }>("/users/me", { auth: true })
  });
  const canCreateProductsCap = Boolean(capsQuery.data?.persona_capabilities?.can_create_products);
  const canManageMembershipsCap = Boolean(capsQuery.data?.persona_capabilities?.can_manage_memberships);

  useEffect(() => {
    if (editProductId) { setListingKind("product"); return; }
    if (canManageMembershipsCap && !canCreateProductsCap) setListingKind("membership");
  }, [editProductId, canManageMembershipsCap, canCreateProductsCap]);

  const draftItems = useMemo(
    () => (myProducts?.items || []).filter((i) => i.status === "draft"),
    [myProducts]
  );

  /* ── Mutations ── */
  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-create-my-products"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-products"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-catalog"] });
    }
  });
  const publishMutation = useMutation({
    mutationFn: publishProduct,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-create-my-products"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-products"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-catalog"] });
    }
  });
  const createTierMutation = useMutation({
    mutationFn: createTier,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-tiers"] });
    }
  });
  const publishTierMutation = useMutation({
    mutationFn: publishTier,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-tiers"] });
    }
  });
  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof patchProduct>[1] }) => patchProduct(id, body),
    onSuccess: async (_, { id }) => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-create-my-products"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-products"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-catalog"] });
      await queryClient.invalidateQueries({ queryKey: ["creator-product-edit", id] });
    }
  });

  const saveDraftPending = createMutation.isPending || patchMutation.isPending;
  const addProductPending = saveDraftPending || publishMutation.isPending;

  /* ── Handlers ── */
  const generateServiceDescription = async () => {
    const k = serviceKeyPoints.trim();
    if (k.length < 5) { setServiceAssistErr("Add key points (bullets or short notes)."); return; }
    setServiceAssistErr("");
    setServiceAssistBusy(true);
    try {
      const lines = [
        title.trim() ? `Product title: ${title.trim()}` : null,
        `Product type: ${productType}`, "", "Key points from creator:", k
      ].filter(Boolean).join("\n");
      const res = await assistPostText(lines, "service_details_generate");
      setServiceDetails(res.suggestion);
    } catch (e) {
      setServiceAssistErr(e instanceof ApiError ? e.message : "Could not generate.");
    } finally {
      setServiceAssistBusy(false);
    }
  };

  const pickDeliveryFile = () => {
    pickVisualMedia({ kind: "product" }, (asset) => {
      if (asset) { setHasRemoteDelivery(false); setDeliveryFile(asset); }
    });
  };

  const readPriceMinor = (): number | null => {
    const cur = currency.toLowerCase();
    if (cur === "usd" && !useMinorPrice) return parseUsdToMinor(priceUsd);
    const raw = priceMinorOnly.replace(/\D/g, "");
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const priceErrorMessage = (): string => {
    const cur = currency.toLowerCase();
    if (cur === "usd" && !useMinorPrice) return "Enter a valid price in USD (e.g. 9.99).";
    return "Enter a valid price in minor units for this currency.";
  };

  /* ── Earnings preview ── */
  const enabledBoostTierRows = useMemo(() => {
    const fromPolicy = connectStatus?.feePolicy?.tiers?.filter((t) => t.enabled);
    if (fromPolicy && fromPolicy.length > 0) return fromPolicy;
    return [
      { key: "standard" as const, label: "Standard", platformFeeBps: BOOST_TIER_BPS.standard, enabled: true, description: "Default distribution placement." },
      { key: "boosted" as const, label: "Boosted", platformFeeBps: BOOST_TIER_BPS.boosted, enabled: true, description: "Higher-priority distribution placement." }
    ];
  }, [connectStatus?.feePolicy?.tiers]);
  const selectedPlatformFeeBps = BOOST_TIER_BPS[boostTier] ?? BOOST_TIER_BPS.standard;
  const previewPriceMinor = readPriceMinor();
  const previewNumbers =
    previewPriceMinor && previewPriceMinor > 0
      ? estimateCreatorNet(previewPriceMinor, selectedPlatformFeeBps, 700, true)
      : null;

  const tierPlatformFeeBps =
    connectStatus?.feePolicy?.tiers?.find((t) => t.key === "standard")?.platformFeeBps || 350;
  const membershipMonthlyMinor = listingKind === "membership" ? parseUsdToMinor(priceUsd) : null;
  const membershipPreview =
    membershipMonthlyMinor && membershipMonthlyMinor > 0
      ? estimateCreatorNet(membershipMonthlyMinor, tierPlatformFeeBps, 700, true)
      : null;

  /* ── Publish membership ── */
  const onPublishMembership = async () => {
    setFormError("");
    if (!canManageMembershipsCap) { setFormError("Membership plans are not enabled for your profile."); return; }
    const t = title.trim();
    if (t.length < 3) { setFormError("Title must be at least 3 characters."); return; }
    const minor = parseUsdToMinor(priceUsd);
    if (minor === null) { setFormError("Enter a valid monthly USD amount."); return; }
    try {
      const tier = await createTierMutation.mutateAsync({
        title: t,
        description: description.trim() || undefined,
        monthlyPriceMinor: minor,
        currency: "usd"
      });
      await publishTierMutation.mutateAsync(tier.id);
      setSuccessKind("added");
      setTimeout(() => { setSuccessKind(null); navigation.goBack(); }, 1600);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not publish membership.");
    }
  };

  /* ── Upload digital delivery ── */
  const uploadDigitalDeliveryFile = async (): Promise<string> => {
    if (!deliveryFile) throw new Error("No delivery file.");
    const mimeType = deliveryFile.mimeType || "application/octet-stream";
    const mediaType = deriveMediaType(mimeType);
    if (!mediaType) throw new Error("Delivery file must be an image or video.");
    const signature = await apiRequest<UploadSignatureResponse>("/media/upload-signature", {
      method: "POST",
      auth: true,
      body: { mediaType, mimeType, originalFilename: deliveryFile.name, fileSizeBytes: deliveryFile.size || 1 }
    });
    const blob = await (await fetch(deliveryFile.uri)).blob();
    const uploaded = await fetch(signature.uploadUrl, { method: "PUT", headers: signature.headers, body: blob });
    if (!uploaded.ok) throw new Error("Could not upload delivery file.");
    return signature.key;
  };

  const buildCommonBody = (t: string, priceMinor: number) => ({
    title: t,
    description: description.trim() || undefined,
    priceMinor,
    currency,
    productType,
    serviceDetails: productType === "digital" ? undefined : serviceDetails.trim() || undefined,
    deliveryMethod: deliveryMethod.trim().slice(0, 120) || undefined,
    websiteUrl: websiteUrl.trim() || undefined,
    audienceTarget,
    businessCategory: businessCategory.trim() || undefined,
    boostTier
  });

  /* ── Save draft ── */
  const onSaveDraft = async () => {
    setFormError("");
    const t = title.trim();
    if (t.length < 3) { setFormError("Title must be at least 3 characters."); return; }
    const priceMinor = readPriceMinor();
    if (priceMinor === null) { setFormError(priceErrorMessage()); return; }
    try {
      const common = buildCommonBody(t, priceMinor);
      if (savedDraftId) {
        await patchMutation.mutateAsync({ id: savedDraftId, body: { ...common, status: "draft" } });
      } else {
        const row = await createMutation.mutateAsync(common);
        if (Number.isFinite(row.id)) setSavedDraftId(row.id);
      }
      setSuccessKind("draft");
      setTimeout(() => setSuccessKind(null), 1500);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not save draft.");
    }
  };

  /* ── Add product (publish) ── */
  const onAddProduct = async () => {
    setFormError("");
    const t = title.trim();
    if (t.length < 3) { setFormError("Title must be at least 3 characters."); return; }
    const priceMinor = readPriceMinor();
    if (priceMinor === null) { setFormError(priceErrorMessage()); return; }
    if (productType === "digital" && !deliveryFile && !hasRemoteDelivery) {
      setFormError("Choose a delivery image or video before publishing."); return;
    }
    try {
      let deliveryMediaKey: string | undefined;
      if (productType === "digital" && deliveryFile) {
        deliveryMediaKey = await uploadDigitalDeliveryFile();
        setHasRemoteDelivery(true);
        setDeliveryFile(null);
      }
      const base = buildCommonBody(t, priceMinor);
      let productId = savedDraftId;
      if (productId) {
        await patchMutation.mutateAsync({ id: productId, body: { ...base, ...(deliveryMediaKey ? { deliveryMediaKey } : {}) } });
      } else {
        const row = await createMutation.mutateAsync({ ...base, ...(deliveryMediaKey ? { deliveryMediaKey } : {}) });
        productId = row.id;
        setSavedDraftId(row.id);
      }
      await publishMutation.mutateAsync(productId);
      setSuccessKind("added");
      setTimeout(() => { setSuccessKind(null); navigation.goBack(); }, 1600);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not add product.");
    }
  };

  const editBlockedNonDraft = Boolean(editRow && editRow.status !== "draft");

  /* ── Stripe import handler ── */
  const handleStripeImport = (draft: ProductImportDraft) => {
    applyDraftToForm(draft, {
      setTitle, setDescription, setCurrency, setPriceUsd, setPriceMinorOnly,
      setUseMinorPrice, setProductType, setWebsiteUrl, setServiceDetails,
      setDeliveryMethod, setAudienceTarget, setBusinessCategory
    });
  };

  /* ── Render ── */
  return (
    <View style={cf.layout}>
      <CreateAppBar title={appBarTitle} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SuccessCheckOverlay
        visible={successKind !== null}
        title={successKind === "added" ? (listingKind === "membership" ? "Membership live" : "Product added") : "Draft saved"}
        subtitle={successKind === "added"
          ? (listingKind === "membership" ? "Supporters can subscribe from your profile." : "Your catalog is updated.")
          : "Nothing was uploaded. Continue editing or publish when ready."}
      />
      <ScrollView
        contentContainerStyle={[cf.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Listing kind toggle ── */}
        {!editProductId ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {canCreateProductsCap ? (
              <Pressable
                style={[cf.chipCanvas, listingKind === "product" && cf.chipCanvasActive]}
                onPress={() => setListingKind("product")}
              >
                <Text style={[cf.chipCanvasText, listingKind === "product" && cf.chipCanvasTextActive]}>Product</Text>
              </Pressable>
            ) : null}
            {canManageMembershipsCap ? (
              <Pressable
                style={[cf.chipCanvas, listingKind === "membership" && cf.chipCanvasActive]}
                onPress={() => setListingKind("membership")}
              >
                <Text style={[cf.chipCanvasText, listingKind === "membership" && cf.chipCanvasTextActive]}>
                  Membership
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* ═══ MEMBERSHIP FLOW ═══ */}
        {listingKind === "membership" && !editProductId ? (
          <>
            <FormCard>
              <SoftTextInput label="Plan title" placeholder="Plan title" value={title} onChangeText={setTitle} />
              <SoftTextArea label="Description" placeholder="What members get each month" value={description} onChangeText={setDescription} minHeight={100} />
              <SoftTextInput label="Monthly price (USD)" placeholder="9.99" value={priceUsd} onChangeText={setPriceUsd} keyboardType="decimal-pad" />
            </FormCard>
            {membershipPreview ? (
              <EarningsPreviewCard
                buyerPays={formatMinorCurrency(membershipMonthlyMinor || 0, "usd")}
                platformFee={formatMinorCurrency((membershipMonthlyMinor || 0) - membershipPreview.creatorNetMinor, "usd")}
                platformFeeLabel="Fees"
                youReceive={formatMinorCurrency(membershipPreview.creatorNetMinor, "usd")}
              />
            ) : (
              <EarningsPreviewCard buyerPays={null} platformFee={null} youReceive={null} />
            )}
            {formError ? <Text style={cf.error}>{formError}</Text> : null}
          </>
        ) : null}

        {/* ═══ PRODUCT FLOW ═══ */}
        {listingKind === "product" || editProductId ? (
          <>
            {editLoading ? (
              <View style={cf.loadingRow}>
                <ActivityIndicator color={cf.f.accentGold} />
                <Text style={cf.canvasHelper}>Loading draft...</Text>
              </View>
            ) : null}
            {editError ? <Text style={cf.error}>Could not open this draft.</Text> : null}
            {editBlockedNonDraft ? (
              <Text style={cf.error}>Only drafts can be edited here.</Text>
            ) : null}

            {/* ── Stripe import (collapsed) ── */}
            <FormCard>
              <CollapsibleSection title="Import from Stripe">
                <Text style={cf.helper}>After payout setup, import from your Stripe catalog by Product ID.</Text>
                <Pressable
                  style={[cf.surfaceTextButton, stripeBusy && cf.primaryCtaDisabled]}
                  onPress={() => {
                    setImportNotice("");
                    setStripeBusy(true);
                    void (async () => {
                      try {
                        const r = await fetchStripeProductImportList({ limit: 40 });
                        setStripeItems(r.items);
                        if (r.items.length === 0) setImportNotice("No active Stripe prices found.");
                      } catch (e) {
                        setImportNotice(e instanceof ApiError ? e.message : "Could not load Stripe catalog.");
                      } finally {
                        setStripeBusy(false);
                      }
                    })();
                  }}
                  disabled={stripeBusy}
                >
                  <Text style={cf.surfaceTextButtonLabel}>
                    {stripeBusy ? "Loading Stripe..." : "Load Stripe prices"}
                  </Text>
                </Pressable>
                <SoftTextInput
                  placeholder="prod_... (Stripe Product ID)"
                  value={stripeProductIdInput}
                  onChangeText={setStripeProductIdInput}
                  autoCapitalize="none"
                />
                <Pressable
                  style={[cf.surfaceTextButton, stripePickBusy && cf.primaryCtaDisabled]}
                  disabled={stripePickBusy}
                  onPress={() => {
                    const sid = stripeProductIdInput.trim();
                    if (!sid) { setImportNotice("Enter a Stripe Product ID (prod_...)."); return; }
                    setImportNotice("");
                    setStripePickBusy(true);
                    void (async () => {
                      try {
                        const r = await importProductDraftFromStripeProductId(sid);
                        if ("needsPriceSelection" in r && r.needsPriceSelection) {
                          setStripeItems(r.items || []);
                          setImportNotice(r.message || "Multiple prices found. Choose one below.");
                          return;
                        }
                        if (!("draft" in r)) { setImportNotice("Stripe Product ID import failed."); return; }
                        handleStripeImport(r.draft);
                      } catch (e) {
                        setImportNotice(e instanceof ApiError ? e.message : "Stripe import failed.");
                      } finally {
                        setStripePickBusy(false);
                      }
                    })();
                  }}
                >
                  <Text style={cf.surfaceTextButtonLabel}>
                    {stripePickBusy ? "Importing..." : "Import from Product ID"}
                  </Text>
                </Pressable>
                {stripeItems.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    {stripeItems.map((row) => (
                      <Pressable
                        key={row.stripePriceId}
                        style={[cf.selectableListRow, stripePickBusy && cf.primaryCtaDisabled]}
                        disabled={stripePickBusy}
                        onPress={() => {
                          setImportNotice("");
                          setStripePickBusy(true);
                          void (async () => {
                            try {
                              const r = await importProductDraftFromStripe({
                                stripeProductId: row.stripeProductId,
                                stripePriceId: row.stripePriceId
                              });
                              handleStripeImport(r.draft);
                            } catch (e) {
                              setImportNotice(e instanceof ApiError ? e.message : "Stripe import failed.");
                            } finally {
                              setStripePickBusy(false);
                            }
                          })();
                        }}
                      >
                        <Text style={cf.selectableListRowText} numberOfLines={2}>
                          {row.title} · {formatMinorCurrency(row.priceMinor, row.currency)}
                          {row.recurring ? ` / ${row.recurring.interval}` : ""}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {importNotice ? <Text style={cf.secondaryCtaLabel}>{importNotice}</Text> : null}
              </CollapsibleSection>
            </FormCard>

            {/* ── Basics card ── */}
            <FormCard>
              <Text style={cf.sectionTitle}>Basics</Text>
              <SubtypeSegmentedControl
                options={[
                  { key: "digital", label: "Digital" },
                  { key: "service", label: "Service" },
                ]}
                value={productType}
                onChange={(k) => setProductType(k as EditableProductType)}
              />
              <SoftTextInput label="Title" placeholder="Product title" value={title} onChangeText={setTitle} maxLength={180} />
              <SoftTextArea label="Description" placeholder="What buyers get" value={description} onChangeText={setDescription} minHeight={100} />

              <Text style={cf.upperLabel}>Audience</Text>
              <ChipRow
                items={[
                  { key: "b2c", label: "Consumers" },
                  { key: "b2b", label: "Businesses" },
                  { key: "both", label: "Both" },
                ]}
                selected={audienceTarget}
                onSelect={(k) => setAudienceTarget(k as "b2b" | "b2c" | "both")}
              />

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
                onSelect={(k) => setBusinessCategory((c) => (c === k ? "" : k))}
              />
            </FormCard>

            {/* ── Media / Delivery card ── */}
            <FormCard>
              <Text style={cf.sectionTitle}>Media & Delivery</Text>
              {productType === "digital" ? (
                <UploadCard
                  height={140}
                  uri={deliveryFile?.uri}
                  mimeType={deliveryFile?.mimeType}
                  title={hasRemoteDelivery ? "Delivery file attached" : "Add delivery file"}
                  hint={hasRemoteDelivery ? "Tap to replace" : "Library, camera, or files"}
                  icon="document-outline"
                  onPress={pickDeliveryFile}
                />
              ) : (
                <>
                  <SoftTextArea
                    label="Key points"
                    placeholder="What you offer, who it is for, format..."
                    value={serviceKeyPoints}
                    onChangeText={setServiceKeyPoints}
                    minHeight={80}
                  />
                  <AIHelperRow
                    label="Generate concise draft"
                    onPress={() => void generateServiceDescription()}
                    busy={serviceAssistBusy}
                  />
                  {serviceAssistErr ? <Text style={cf.errorSmall}>{serviceAssistErr}</Text> : null}
                  <SoftTextArea
                    label="Service description"
                    placeholder="Service description & value proposition"
                    value={serviceDetails}
                    onChangeText={setServiceDetails}
                    minHeight={80}
                  />
                </>
              )}
              <SoftTextInput label="Delivery method" placeholder="Email, DM, etc." value={deliveryMethod} onChangeText={setDeliveryMethod} maxLength={120} />
              <SoftTextInput label="Website" placeholder="https://..." value={websiteUrl} onChangeText={setWebsiteUrl} autoCapitalize="none" keyboardType="url" />
            </FormCard>

            {/* ── Pricing card ── */}
            <FormCard>
              <Text style={cf.sectionTitle}>Pricing</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ width: 80 }}>
                  <SoftTextInput
                    placeholder="usd"
                    value={currency}
                    onChangeText={(v) => setCurrency(v.trim().toLowerCase().slice(0, 3) || "usd")}
                    autoCapitalize="characters"
                    maxLength={3}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  {currency.toLowerCase() === "usd" && !useMinorPrice ? (
                    <SoftTextInput placeholder="9.99" value={priceUsd} onChangeText={setPriceUsd} keyboardType="decimal-pad" />
                  ) : (
                    <SoftTextInput placeholder="Minor units" value={priceMinorOnly} onChangeText={setPriceMinorOnly} keyboardType="number-pad" />
                  )}
                </View>
              </View>
              <Pressable style={cf.textLinkPressable} onPress={() => setUseMinorPrice((x) => !x)}>
                <Text style={cf.secondaryCtaLabel}>
                  {useMinorPrice ? "Using minor units" : "Using USD"} — tap to toggle
                </Text>
              </Pressable>
            </FormCard>

            {/* ── Distribution / Boost card ── */}
            <FormCard>
              <Text style={cf.sectionTitle}>Distribution & Boost</Text>
              <ChipRow
                items={enabledBoostTierRows.map(({ key, label, platformFeeBps }) => ({
                  key,
                  label: `${label} ${(platformFeeBps / 100).toFixed(1)}%`,
                }))}
                selected={boostTier}
                onSelect={(k) => setBoostTier(k as MonetizationBoostTier)}
              />
              <Text style={cf.helper}>
                Boost tiers are optional distribution upgrades. Start standard and change later.
              </Text>
            </FormCard>

            {/* ── Earnings preview ── */}
            <EarningsPreviewCard
              buyerPays={previewPriceMinor ? formatMinorCurrency(previewPriceMinor, currency) : null}
              platformFee={previewNumbers ? formatMinorCurrency(previewNumbers.platformFeeMinor, currency) : null}
              platformFeeLabel={`Platform fee (${(selectedPlatformFeeBps / 100).toFixed(1)}%)`}
              affiliateImpact={previewNumbers ? formatMinorCurrency(previewNumbers.affiliateMinor, currency) : null}
              youReceive={previewNumbers ? formatMinorCurrency(previewNumbers.creatorNetMinor, currency) : null}
            />

            {/* ── Drafts list ── */}
            {draftItems.length > 0 && !editProductId ? (
              <FormCard>
                <CollapsibleSection title="Your drafts">
                  <Text style={cf.helper}>Tap to resume editing a draft.</Text>
                  {draftItems.map((d) => (
                    <Pressable
                      key={d.id}
                      style={cf.selectableListRow}
                      onPress={() => navigation.navigate("CreateProduct", { editProductId: d.id })}
                    >
                      <Text style={cf.selectableListRowText} numberOfLines={2}>
                        {d.title} · {formatMinorCurrency(Number(d.price_minor || 0), d.currency || "usd")}
                      </Text>
                    </Pressable>
                  ))}
                </CollapsibleSection>
              </FormCard>
            ) : null}

            {formError ? <Text style={cf.error}>{formError}</Text> : null}
          </>
        ) : null}
      </ScrollView>

      {/* ── Sticky CTA ── */}
      {listingKind === "membership" && !editProductId ? (
        <StickyCtaBar
          primaryLabel={publishTierMutation.isPending ? "Publishing..." : createTierMutation.isPending ? "Saving..." : "Publish membership"}
          onPrimary={() => void onPublishMembership()}
          primaryDisabled={createTierMutation.isPending || publishTierMutation.isPending}
          primaryLoading={createTierMutation.isPending || publishTierMutation.isPending}
        />
      ) : (listingKind === "product" || editProductId) ? (
        <StickyCtaBar
          primaryLabel={addProductPending ? (publishMutation.isPending ? "Publishing..." : "Preparing...") : "Add product"}
          onPrimary={() => void onAddProduct()}
          primaryDisabled={addProductPending || editLoading || editBlockedNonDraft}
          primaryLoading={addProductPending}
          secondaryLabel={saveDraftPending ? "Saving..." : "Save draft"}
          onSecondary={() => void onSaveDraft()}
          secondaryDisabled={saveDraftPending || editLoading || editBlockedNonDraft}
        />
      ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  overlayBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24
  }
});
