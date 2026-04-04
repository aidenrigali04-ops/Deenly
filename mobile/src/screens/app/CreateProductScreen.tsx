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
  TextInput,
  View
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../lib/api";
import { assistPostText } from "../../lib/ai-assist";
import {
  createProduct,
  publishProduct,
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
import { colors, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

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

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
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

function SuccessCheckOverlay({
  visible,
  title,
  subtitle
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0);
      fade.setValue(0);
      return;
    }
    fade.setValue(0);
    scale.setValue(0);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 100,
        useNativeDriver: true
      })
    ]).start();
  }, [visible, fade, scale]);

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View style={[styles.overlayBackdrop, { opacity: fade }]}>
        <View style={styles.overlayCard}>
          <Animated.View style={[styles.checkCircle, { transform: [{ scale }] }]}>
            <Text style={styles.checkMark}>✓</Text>
          </Animated.View>
          <Text style={styles.overlayTitle}>{title}</Text>
          {subtitle ? <Text style={styles.overlaySubtitle}>{subtitle}</Text> : null}
        </View>
      </Animated.View>
    </Modal>
  );
}

export function CreateProductScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const appliedInitialDraft = useRef(false);
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

  useEffect(() => {
    const d = route.params?.initialDraft;
    if (editProductId || !d || appliedInitialDraft.current) {
      return;
    }
    appliedInitialDraft.current = true;
    applyDraftToForm(d, {
      setTitle,
      setDescription,
      setCurrency,
      setPriceUsd,
      setPriceMinorOnly,
      setUseMinorPrice,
      setProductType,
      setWebsiteUrl,
      setServiceDetails,
      setDeliveryMethod,
      setAudienceTarget,
      setBusinessCategory
    });
  }, [route.params?.initialDraft, editProductId]);

  const hydratedEditId = useRef<number | null>(null);
  useEffect(() => {
    hydratedEditId.current = null;
  }, [editProductId]);

  const { data: editRow, isLoading: editLoading, isError: editError } = useQuery({
    queryKey: ["creator-product-edit", editProductId],
    queryFn: () => fetchMyProductById(editProductId!),
    enabled: Boolean(editProductId && editProductId > 0)
  });

  useEffect(() => {
    if (!editProductId || !editRow || hydratedEditId.current === editProductId) {
      return;
    }
    if (editRow.status !== "draft") {
      hydratedEditId.current = editProductId;
      return;
    }
    hydratedEditId.current = editProductId;
    applyProductDetailToForm(editRow, {
      setTitle,
      setDescription,
      setCurrency,
      setPriceUsd,
      setPriceMinorOnly,
      setUseMinorPrice,
      setProductType,
      setWebsiteUrl,
      setServiceDetails,
      setDeliveryMethod,
      setAudienceTarget,
      setBusinessCategory,
      setBoostTier,
      setHasRemoteDelivery,
      setDeliveryFile,
      setSavedDraftId
    });
  }, [editProductId, editRow]);

  const { data: myProducts } = useQuery({
    queryKey: ["mobile-create-my-products"],
    queryFn: () => fetchMyProducts({ limit: 50 })
  });
  const { data: connectStatus } = useQuery({
    queryKey: ["mobile-create-connect-status"],
    queryFn: () => fetchConnectStatus()
  });

  const draftItems = useMemo(
    () => (myProducts?.items || []).filter((i) => i.status === "draft"),
    [myProducts]
  );

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

  const generateServiceDescription = async () => {
    const k = serviceKeyPoints.trim();
    if (k.length < 5) {
      setServiceAssistErr("Add key points (bullets or short notes).");
      return;
    }
    setServiceAssistErr("");
    setServiceAssistBusy(true);
    try {
      const lines = [
        title.trim() ? `Product title: ${title.trim()}` : null,
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

  const pickDeliveryFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "video/*"],
      copyToCacheDirectory: true
    });
    if (!result.canceled && result.assets.length > 0) {
      setHasRemoteDelivery(false);
      setDeliveryFile(result.assets[0]);
    }
  };

  const readPriceMinor = (): number | null => {
    const cur = currency.toLowerCase();
    if (cur === "usd" && !useMinorPrice) {
      return parseUsdToMinor(priceUsd);
    }
    const raw = priceMinorOnly.replace(/\D/g, "");
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const priceErrorMessage = (): string => {
    const cur = currency.toLowerCase();
    if (cur === "usd" && !useMinorPrice) {
      return "Enter a valid price in USD (e.g. 9.99).";
    }
    return "Enter a valid price in minor units for this currency.";
  };

  const enabledBoostTierRows = useMemo(() => {
    const fromPolicy = connectStatus?.feePolicy?.tiers?.filter((t) => t.enabled);
    if (fromPolicy && fromPolicy.length > 0) {
      return fromPolicy;
    }
    return [
      {
        key: "standard" as const,
        label: "Standard",
        platformFeeBps: BOOST_TIER_BPS.standard,
        enabled: true,
        description: "Default distribution placement."
      },
      {
        key: "boosted" as const,
        label: "Boosted",
        platformFeeBps: BOOST_TIER_BPS.boosted,
        enabled: true,
        description: "Higher-priority distribution placement."
      }
    ];
  }, [connectStatus?.feePolicy?.tiers]);
  const selectedPlatformFeeBps = BOOST_TIER_BPS[boostTier] ?? BOOST_TIER_BPS.standard;
  const previewPriceMinor = readPriceMinor();
  const previewNumbers =
    previewPriceMinor && previewPriceMinor > 0
      ? estimateCreatorNet(previewPriceMinor, selectedPlatformFeeBps, 700, true)
      : null;

  const uploadDigitalDeliveryFile = async (): Promise<string> => {
    if (!deliveryFile) {
      throw new Error("No delivery file.");
    }
    const mimeType = deliveryFile.mimeType || "application/octet-stream";
    const mediaType = deriveMediaType(mimeType);
    if (!mediaType) {
      throw new Error("Delivery file must be an image or video.");
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
    return signature.key;
  };

  const buildCommonBody = (t: string, priceMinor: number) => ({
    title: t,
    description: description.trim() || undefined,
    priceMinor,
    currency,
    productType,
    serviceDetails:
      productType === "digital" ? undefined : serviceDetails.trim() || undefined,
    deliveryMethod: deliveryMethod.trim().slice(0, 120) || undefined,
    websiteUrl: websiteUrl.trim() || undefined,
    audienceTarget,
    businessCategory: businessCategory.trim() || undefined,
    boostTier
  });

  const onSaveDraft = async () => {
    setFormError("");
    const t = title.trim();
    if (t.length < 3) {
      setFormError("Title must be at least 3 characters.");
      return;
    }
    const priceMinor = readPriceMinor();
    if (priceMinor === null) {
      setFormError(priceErrorMessage());
      return;
    }

    try {
      const common = buildCommonBody(t, priceMinor);
      if (savedDraftId) {
        await patchMutation.mutateAsync({ id: savedDraftId, body: { ...common, status: "draft" } });
      } else {
        const row = await createMutation.mutateAsync(common);
        if (Number.isFinite(row.id)) {
          setSavedDraftId(row.id);
        }
      }
      setSuccessKind("draft");
      setTimeout(() => setSuccessKind(null), 1500);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not save draft.");
    }
  };

  const onAddProduct = async () => {
    setFormError("");
    const t = title.trim();
    if (t.length < 3) {
      setFormError("Title must be at least 3 characters.");
      return;
    }
    const priceMinor = readPriceMinor();
    if (priceMinor === null) {
      setFormError(priceErrorMessage());
      return;
    }
    if (productType === "digital" && !deliveryFile && !hasRemoteDelivery) {
      setFormError("Choose a delivery image or video before publishing.");
      return;
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
        await patchMutation.mutateAsync({
          id: productId,
          body: {
            ...base,
            ...(deliveryMediaKey ? { deliveryMediaKey } : {})
          }
        });
      } else {
        const row = await createMutation.mutateAsync({
          ...base,
          ...(deliveryMediaKey ? { deliveryMediaKey } : {})
        });
        productId = row.id;
        setSavedDraftId(row.id);
      }

      await publishMutation.mutateAsync(productId);
      setSuccessKind("added");
      setTimeout(() => {
        setSuccessKind(null);
        navigation.goBack();
      }, 1600);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not add product.");
    }
  };

  const editBlockedNonDraft = Boolean(editRow && editRow.status !== "draft");

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SuccessCheckOverlay
        visible={successKind !== null}
        title={successKind === "added" ? "Product added" : "Draft saved"}
        subtitle={
          successKind === "added"
            ? "Your catalog is updated."
            : "Nothing was uploaded. Continue editing or publish when ready."
        }
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lede}>
          Publish goes live on your catalog. Save draft keeps work private—delivery uploads only when you publish.
        </Text>

        {editLoading ? (
          <View style={styles.editLoadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.editLoadingText}>Loading draft…</Text>
          </View>
        ) : null}
        {editError ? <Text style={styles.error}>Could not open this draft.</Text> : null}
        {editBlockedNonDraft ? (
          <Text style={styles.error}>Only drafts can be edited here. Published products are managed from your profile.</Text>
        ) : null}

        {draftItems.length > 0 && !editProductId ? (
          <>
            <SectionLabel>Drafts</SectionLabel>
            <Text style={styles.importHint}>Tap to resume. Drafts never upload delivery files.</Text>
            <View style={styles.stripeList}>
              {draftItems.map((d) => (
                <Pressable
                  key={d.id}
                  style={styles.stripeRow}
                  onPress={() => navigation.navigate("CreateProduct", { editProductId: d.id })}
                >
                  <Text style={styles.stripeRowText} numberOfLines={2}>
                    {d.title} · {formatMinorCurrency(Number(d.price_minor || 0), d.currency || "usd")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <SectionLabel>Import</SectionLabel>
        <Text style={styles.importHint}>
          After payout setup is complete, you can import from your Stripe catalog by Product ID to auto-fill fields.
        </Text>
        <Pressable
          style={[styles.btnSecondary, stripeBusy && styles.btnDisabled]}
          onPress={() => {
            setImportNotice("");
            setStripeBusy(true);
            void (async () => {
              try {
                const r = await fetchStripeProductImportList({ limit: 40 });
                setStripeItems(r.items);
                if (r.items.length === 0) {
                  setImportNotice("No active Stripe prices found.");
                }
              } catch (e) {
                setImportNotice(e instanceof ApiError ? e.message : "Could not load Stripe catalog.");
              } finally {
                setStripeBusy(false);
              }
            })();
          }}
          disabled={stripeBusy}
        >
          <Text style={styles.btnSecondaryText}>{stripeBusy ? "Loading Stripe…" : "Load Stripe prices"}</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="prod_... (Stripe Product ID)"
          placeholderTextColor={colors.muted}
          value={stripeProductIdInput}
          onChangeText={setStripeProductIdInput}
          autoCapitalize="none"
        />
        <Pressable
          style={[styles.btnSecondary, stripePickBusy && styles.btnDisabled]}
          disabled={stripePickBusy}
          onPress={() => {
            const stripeProductId = stripeProductIdInput.trim();
            if (!stripeProductId) {
              setImportNotice("Enter a Stripe Product ID (prod_...).");
              return;
            }
            setImportNotice("");
            setStripePickBusy(true);
            void (async () => {
              try {
                const r = await importProductDraftFromStripeProductId(stripeProductId);
                if ("needsPriceSelection" in r && r.needsPriceSelection) {
                  setStripeItems(r.items || []);
                  setImportNotice(r.message || "Multiple prices found. Choose one below.");
                  return;
                }
                if (!("draft" in r)) {
                  setImportNotice("Stripe Product ID import failed.");
                  return;
                }
                applyDraftToForm(r.draft, {
                  setTitle,
                  setDescription,
                  setCurrency,
                  setPriceUsd,
                  setPriceMinorOnly,
                  setUseMinorPrice,
                  setProductType,
                  setWebsiteUrl,
                  setServiceDetails,
                  setDeliveryMethod,
                  setAudienceTarget,
                  setBusinessCategory
                });
              } catch (e) {
                setImportNotice(e instanceof ApiError ? e.message : "Stripe Product ID import failed.");
              } finally {
                setStripePickBusy(false);
              }
            })();
          }}
        >
          <Text style={styles.btnSecondaryText}>{stripePickBusy ? "Importing…" : "Import from Product ID"}</Text>
        </Pressable>
        {stripeItems.length > 0 ? (
          <View style={styles.stripeList}>
            {stripeItems.map((row) => (
              <Pressable
                key={row.stripePriceId}
                style={[styles.stripeRow, stripePickBusy && styles.btnDisabled]}
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
                      applyDraftToForm(r.draft, {
                        setTitle,
                        setDescription,
                        setCurrency,
                        setPriceUsd,
                        setPriceMinorOnly,
                        setUseMinorPrice,
                        setProductType,
                        setWebsiteUrl,
                        setServiceDetails,
                        setDeliveryMethod,
                        setAudienceTarget,
                        setBusinessCategory
                      });
                    } catch (e) {
                      setImportNotice(e instanceof ApiError ? e.message : "Stripe import failed.");
                    } finally {
                      setStripePickBusy(false);
                    }
                  })();
                }}
              >
                <Text style={styles.stripeRowText} numberOfLines={2}>
                  {row.title} · {formatMinorCurrency(row.priceMinor, row.currency)}
                  {row.recurring ? ` / ${row.recurring.interval}` : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {importNotice ? <Text style={styles.importNotice}>{importNotice}</Text> : null}

        <SectionLabel>Pricing & type</SectionLabel>
        <TextInput
          style={styles.input}
          placeholder="Currency (usd, eur, …)"
          placeholderTextColor={colors.muted}
          value={currency}
          onChangeText={(v) => setCurrency(v.trim().toLowerCase().slice(0, 3) || "usd")}
          autoCapitalize="characters"
          maxLength={3}
        />
        {currency.toLowerCase() === "usd" && !useMinorPrice ? (
          <TextInput
            style={styles.input}
            placeholder="Price USD (e.g. 9.99)"
            placeholderTextColor={colors.muted}
            value={priceUsd}
            onChangeText={setPriceUsd}
            keyboardType="decimal-pad"
          />
        ) : (
          <TextInput
            style={styles.input}
            placeholder="Price in minor units (smallest currency unit)"
            placeholderTextColor={colors.muted}
            value={priceMinorOnly}
            onChangeText={setPriceMinorOnly}
            keyboardType="number-pad"
          />
        )}
        <Pressable
          style={styles.chip}
          onPress={() => setUseMinorPrice((x) => !x)}
        >
          <Text style={styles.chipText}>
            {useMinorPrice ? "Using minor units" : "Using USD dollars"} — tap to toggle
          </Text>
        </Pressable>
        <View style={styles.chipRow}>
          {(["digital", "service"] as const).map((pt) => (
            <Pressable
              key={pt}
              onPress={() => setProductType(pt)}
              style={[styles.chip, productType === pt && styles.chipOn]}
            >
              <Text style={[styles.chipText, productType === pt && styles.chipTextOn]}>{pt}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hintText}>Recurring offers are managed as Membership plans in Creator hub.</Text>

        <SectionLabel>Marketplace boost</SectionLabel>
        <View style={styles.chipRow}>
          {enabledBoostTierRows.map(({ key, label, platformFeeBps }) => (
            <Pressable
              key={key}
              onPress={() => setBoostTier(key)}
              style={[styles.chip, boostTier === key && styles.chipOn]}
            >
              <Text style={[styles.chipText, boostTier === key && styles.chipTextOn]} numberOfLines={1}>
                {label} {(platformFeeBps / 100).toFixed(1)}%
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hintText}>Boost tiers are optional distribution upgrades. You can start standard and change later.</Text>
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Payout preview</Text>
          <Text style={styles.previewCopy}>
            Buyer pays: {previewPriceMinor ? formatMinorCurrency(previewPriceMinor, currency) : "—"}
          </Text>
          <Text style={styles.previewCopy}>
            Platform fee ({(selectedPlatformFeeBps / 100).toFixed(1)}%):{" "}
            {previewNumbers ? formatMinorCurrency(previewNumbers.platformFeeMinor, currency) : "—"}
          </Text>
          <Text style={styles.previewCopy}>
            Affiliate impact (up to 7.0%):{" "}
            {previewNumbers ? formatMinorCurrency(previewNumbers.affiliateMinor, currency) : "—"}
          </Text>
          <Text style={styles.previewNet}>
            You receive (estimated):{" "}
            {previewNumbers ? formatMinorCurrency(previewNumbers.creatorNetMinor, currency) : "Add valid price"}
          </Text>
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
              {deliveryFile
                ? deliveryFile.name || "File selected"
                : hasRemoteDelivery
                  ? "Delivery file attached — tap to replace"
                  : "Tap to choose delivery image or video (required to publish)"}
            </Text>
          </Pressable>
        ) : (
          <View style={{ gap: 8 }}>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Key points — what you offer, who it is for, format, length…"
              placeholderTextColor={colors.muted}
              value={serviceKeyPoints}
              onChangeText={setServiceKeyPoints}
              multiline
            />
            <Pressable
              style={[styles.btnSecondary, serviceAssistBusy && styles.btnDisabled]}
              onPress={() => void generateServiceDescription()}
              disabled={serviceAssistBusy}
            >
              <Text style={styles.btnSecondaryText}>
                {serviceAssistBusy ? "Generating…" : "Generate concise draft"}
              </Text>
            </Pressable>
            {serviceAssistErr ? <Text style={styles.error}>{serviceAssistErr}</Text> : null}
            <Text style={styles.importHint}>Concise draft fills the box below — edit as needed.</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Service description & value proposition"
              placeholderTextColor={colors.muted}
              value={serviceDetails}
              onChangeText={setServiceDetails}
              multiline
            />
          </View>
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

        <Pressable
          style={[styles.btnPrimary, (addProductPending || editLoading || editBlockedNonDraft) && styles.btnDisabled]}
          onPress={() => void onAddProduct()}
          disabled={addProductPending || editLoading || editBlockedNonDraft}
        >
          <Text style={styles.btnPrimaryText}>
            {addProductPending
              ? publishMutation.isPending
                ? "Publishing…"
                : "Preparing…"
              : "Add product"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.btnSecondary, (saveDraftPending || editLoading || editBlockedNonDraft) && styles.btnDisabled]}
          onPress={() => void onSaveDraft()}
          disabled={saveDraftPending || editLoading || editBlockedNonDraft}
        >
          <Text style={styles.btnSecondaryText}>{saveDraftPending ? "Saving…" : "Save draft"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, gap: 10 },
  lede: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 10, letterSpacing: -0.2 },
  sectionLabel: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
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
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.subtleFill },
  chipText: { fontSize: 13, color: colors.muted, fontWeight: "600", textTransform: "capitalize" },
  chipTextOn: { color: colors.text },
  hintText: { fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: 2 },
  previewCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4
  },
  previewTitle: { fontSize: 12, color: colors.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  previewCopy: { fontSize: 13, color: colors.muted },
  previewNet: { fontSize: 14, color: colors.text, fontWeight: "700", marginTop: 2 },
  filePick: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
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
  btnSecondary: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.control,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    backgroundColor: colors.surface
  },
  btnSecondaryText: { fontSize: 14, fontWeight: "700", color: colors.accent },
  importHint: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  stripeList: { gap: 6 },
  stripeRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.control,
    padding: 12,
    backgroundColor: colors.surface
  },
  stripeRowText: { fontSize: 13, color: colors.text, fontWeight: "600" },
  importNotice: { fontSize: 13, color: colors.accent, marginTop: 4 },
  overlayBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24
  },
  overlayCard: {
    alignItems: "center",
    maxWidth: 300,
    width: "100%",
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: radii.panel,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.subtleFill,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16
  },
  checkMark: { fontSize: 36, color: colors.accent, fontWeight: "700" },
  overlayTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
    letterSpacing: -0.4
  },
  overlaySubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 21,
    letterSpacing: -0.1,
    paddingHorizontal: 8
  },
  editLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  editLoadingText: { fontSize: 14, color: colors.muted }
});
