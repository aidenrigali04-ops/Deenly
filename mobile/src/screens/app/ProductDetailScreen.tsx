import { useRef, useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../lib/api";
import { fetchProductOverview } from "../../lib/ai-assist";
import {
  createGuestProductCheckout,
  createProductCheckout,
  fetchCatalogProduct,
  formatMinorCurrency
} from "../../lib/monetization";
import { ProductCheckoutSheet } from "../../components/ProductCheckoutSheet";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { hapticPrimary, hapticSuccess, hapticTap } from "../../lib/haptics";
import { resolveMediaUrl } from "../../lib/media-url";
import { colors, primaryButtonOutline, radii, shadows } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { useSessionStore } from "../../store/session-store";

type ProductRow = {
  id: number;
  creator_user_id: number;
  title: string;
  description: string | null;
  price_minor: number;
  currency: string;
  product_type: string;
  status: string;
  service_details: string | null;
  delivery_method: string | null;
  website_url: string | null;
  audience_target: string | null;
  business_category: string | null;
  creator_username?: string | null;
  creator_display_name?: string | null;
  creator_avatar_url?: string | null;
};

type Props = NativeStackScreenProps<RootStackParamList, "ProductDetail">;

function productTypeLabel(t: string) {
  if (t === "digital") return "Digital";
  if (t === "service") return "Service";
  if (t === "subscription") return "Subscription";
  return t;
}

function productTypeSummary(t: string) {
  if (t === "digital") return "Digital delivery after checkout.";
  if (t === "service") return "Service details are confirmed after purchase.";
  if (t === "subscription") return "Recurring access subscription.";
  return "Offer details are shown below.";
}

function resolveCheckoutVariant(seed: number): "trust_first" | "speed_first" {
  return seed % 2 === 0 ? "trust_first" : "speed_first";
}

export function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params;
  const checkoutVariant = resolveCheckoutVariant(productId);
  const sessionUser = useSessionStore((s) => s.user);
  const queryClient = useQueryClient();
  const [aiOpen, setAiOpen] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutHandoff, setCheckoutHandoff] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const [offerSectionY, setOfferSectionY] = useState(0);

  const productQuery = useQuery({
    queryKey: ["mobile-product-detail", productId, sessionUser ? "auth" : "catalog"],
    queryFn: async () => {
      if (sessionUser) {
        return apiRequest<ProductRow>(`/monetization/products/${productId}`, { auth: true });
      }
      return fetchCatalogProduct(productId);
    }
  });

  const overviewMutation = useMutation({
    mutationFn: () => fetchProductOverview(productId)
  });

  const checkoutMutation = useMutation({
    mutationFn: () => createProductCheckout(productId, { checkoutVariant }),
    onSuccess: async (result) => {
      if (result?.checkoutUrl) {
        setCheckoutHandoff(true);
        await hapticSuccess();
        await new Promise((resolve) => setTimeout(resolve, 220));
        await Linking.openURL(result.checkoutUrl);
        setCheckoutHandoff(false);
      }
    }
  });

  const guestCheckoutMutation = useMutation({
    mutationFn: (email?: string) =>
      createGuestProductCheckout(productId, { smsOptIn: false, guestEmail: email, checkoutVariant }),
    onSuccess: async (result) => {
      if (result?.checkoutUrl) {
        setCheckoutHandoff(true);
        await hapticSuccess();
        await new Promise((resolve) => setTimeout(resolve, 220));
        await Linking.openURL(result.checkoutUrl);
        setCheckoutHandoff(false);
      }
    }
  });

  const archiveProductMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/monetization/products/${productId}`, {
        method: "PATCH",
        auth: true,
        body: { status: "archived" }
      }),
    onMutate: () => {
      setArchiveError("");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-product-detail", productId] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-products"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-creator-catalog"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-create-my-products"] });
      await queryClient.invalidateQueries({ queryKey: ["creator-product-edit", productId] });
      await productQuery.refetch();
    },
    onError: (error) => {
      setArchiveError(error instanceof ApiError ? error.message : "Could not archive listing.");
    }
  });

  const scrollToFullOffer = () => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, offerSectionY - 12),
      animated: true
    });
  };

  if (productQuery.isLoading) {
    return <LoadingState label="Loading product..." />;
  }
  if (productQuery.error) {
    return (
      <ErrorState
        message={(productQuery.error as Error).message}
        onRetry={() => productQuery.refetch()}
      />
    );
  }
  const product = productQuery.data;
  if (!product) {
    return <EmptyState title="Product not found" />;
  }

  const isOwner = sessionUser?.id === product.creator_user_id;
  const isPublished = product.status === "published";
  const canBuy = isPublished && !isOwner;
  const showViewOffer = isPublished;
  const websiteOk = product.website_url && /^https?:\/\//i.test(product.website_url);

  const onBuyNow = () => {
    if (!canBuy) return;
    setCheckoutOpen(true);
  };

  const buyPending = checkoutMutation.isPending || guestCheckoutMutation.isPending;
  const checkoutError = checkoutMutation.error || guestCheckoutMutation.error;
  const creatorAvatarUri = resolveMediaUrl(product.creator_avatar_url) || undefined;
  const creatorHandle = product.creator_username ? `@${product.creator_username}` : null;
  const creatorName = product.creator_display_name || creatorHandle || "Creator";
  const priceLabel = formatMinorCurrency(Number(product.price_minor || 0), product.currency || "usd");

  return (
    <>
      <ProductCheckoutSheet
        visible={checkoutOpen}
        title={product.title}
        priceLabel={priceLabel}
        isGuest={!sessionUser}
        guestEmail={guestEmail}
        loading={buyPending}
        handoffState={checkoutHandoff}
        checkoutVariant={checkoutVariant}
        errorMessage={checkoutError ? (checkoutError as Error).message : undefined}
        onGuestEmailChange={setGuestEmail}
        onClose={() => {
          if (!buyPending) setCheckoutOpen(false);
        }}
        onConfirm={() => {
          setCheckoutHandoff(false);
          if (sessionUser) {
            void checkoutMutation
              .mutateAsync()
              .then(() => setCheckoutOpen(false))
              .catch(() => undefined);
            return;
          }
          const nextEmail = guestEmail.trim();
          void guestCheckoutMutation
            .mutateAsync(nextEmail || undefined)
            .then(() => setCheckoutOpen(false))
            .catch(() => undefined);
        }}
      />
      <ScrollView
        ref={scrollRef}
        style={styles.root}
        contentContainerStyle={styles.content}
      >
        <View style={[styles.card, shadows.card]}>
          {product.creator_user_id ? (
            <Pressable
              style={styles.creatorRow}
              onPress={() => navigation.navigate("UserProfile", { id: product.creator_user_id })}
            >
              {creatorAvatarUri ? (
                <Image source={{ uri: creatorAvatarUri }} style={styles.creatorAvatar} />
              ) : (
                <View style={[styles.creatorAvatar, styles.creatorAvatarFallback]}>
                  <Text style={styles.creatorAvatarLetter}>{creatorName.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.creatorTextWrap}>
                <Text style={styles.creatorName} numberOfLines={1}>
                  {creatorName}
                </Text>
                {creatorHandle ? (
                  <Text style={styles.creatorHandle} numberOfLines={1}>
                    {creatorHandle}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.creatorLink}>View profile</Text>
            </Pressable>
          ) : null}

        <Text style={styles.title}>{product.title}</Text>
        <Text style={styles.price}>{priceLabel}</Text>
        <Text style={styles.meta}>
          {productTypeLabel(product.product_type)}
          {product.business_category ? ` · ${product.business_category.replace(/_/g, " ")}` : ""}
          {!isPublished ? ` · ${product.status}` : ""}
        </Text>
        <Text style={styles.summaryLine}>{productTypeSummary(product.product_type)}</Text>

        {showViewOffer ? (
          <Text style={styles.teaserMuted}>
            Open full details for description, delivery, and exactly what buyers receive.
          </Text>
        ) : null}

        <View style={styles.ctaRow}>
          {showViewOffer ? (
            <Pressable
              style={({ pressed }) => [styles.buttonOutline, styles.ctaHalf, pressed && styles.buttonPressed]}
              onPress={() => {
                void hapticTap();
                scrollToFullOffer();
              }}
            >
              <Text style={styles.buttonOutlineText}>View offer</Text>
            </Pressable>
          ) : (
            <View style={styles.ctaHalf} />
          )}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.ctaHalf,
              (!canBuy || buyPending) && styles.buttonDisabled,
              pressed && canBuy && !buyPending && styles.buttonPressed
            ]}
            onPress={() => {
              void hapticPrimary();
              void onBuyNow();
            }}
            disabled={!canBuy || buyPending}
          >
            <Text style={styles.buttonText}>
              {buyPending ? "Opening…" : isOwner ? "Your product" : "Buy securely"}
            </Text>
          </Pressable>
        </View>
        {canBuy ? (
          <Text style={styles.buyHint}>
            Secure Stripe Checkout in your browser — Apple Pay or Google Pay appears when your device and Stripe
            settings support it.
          </Text>
        ) : null}

        {websiteOk ? (
          <Pressable
            style={styles.linkBtn}
            onPress={() => Linking.openURL(product.website_url!)}
          >
            <Text style={styles.linkText}>Visit website</Text>
          </Pressable>
        ) : null}

        {product.creator_user_id ? (
          <Pressable
            style={styles.linkBtn}
            onPress={() => navigation.navigate("UserProfile", { id: product.creator_user_id })}
          >
            <Text style={styles.linkText}>View creator profile</Text>
          </Pressable>
        ) : null}

        {isOwner && !isPublished ? (
          <Text style={styles.hint}>Publish this product from Creator hub so others can buy it.</Text>
        ) : null}
        {isOwner && isPublished ? (
          <View style={styles.ownerActions}>
            <Pressable
              style={[styles.archiveBtn, archiveProductMutation.isPending && styles.buttonDisabled]}
              disabled={archiveProductMutation.isPending}
              onPress={() => {
                Alert.alert(
                  "Archive listing?",
                  "Buyers will no longer see this product in your catalog. You can republish from Creator hub.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Archive",
                      style: "destructive",
                      onPress: () => archiveProductMutation.mutate()
                    }
                  ]
                );
              }}
            >
              <Text style={styles.archiveBtnText}>
                {archiveProductMutation.isPending ? "Archiving…" : "Archive listing"}
              </Text>
            </Pressable>
            {archiveError ? <Text style={styles.errorText}>{archiveError}</Text> : null}
          </View>
        ) : null}
        </View>

        <View
          style={[styles.card, shadows.card]}
          onLayout={(e) => setOfferSectionY(e.nativeEvent.layout.y)}
        >
          <Text style={styles.sectionHeading}>Full offer</Text>
          {product.description ? (
            <View style={styles.block}>
              <Text style={styles.label}>Description</Text>
              <Text style={styles.body}>{product.description}</Text>
            </View>
          ) : (
            <Text style={styles.muted}>No short description provided.</Text>
          )}
          {product.service_details ? (
            <View style={styles.block}>
              <Text style={styles.label}>What you get</Text>
              <Text style={styles.body}>{product.service_details}</Text>
            </View>
          ) : null}
          <View style={styles.block}>
            <Text style={styles.label}>Delivery</Text>
            <Text style={styles.body}>
              {product.delivery_method?.trim() || "Confirmed after checkout where applicable."}
            </Text>
          </View>
        </View>

        {isPublished || isOwner ? (
          <View style={[styles.card, shadows.card]}>
            <Pressable
              onPress={() => {
                const next = !aiOpen;
                setAiOpen(next);
                if (
                  next &&
                  !overviewMutation.data &&
                  !overviewMutation.isPending &&
                  !overviewMutation.isError
                ) {
                  overviewMutation.mutate();
                }
              }}
            >
              <Text style={styles.aiToggle}>{aiOpen ? "Hide quick summary" : "Quick summary"}</Text>
            </Pressable>
            {aiOpen ? (
              <View style={styles.aiBody}>
                {overviewMutation.isPending ? (
                  <Text style={styles.muted}>Generating quick summary…</Text>
                ) : overviewMutation.isError ? (
                  <View>
                    <Text style={styles.errorText}>{(overviewMutation.error as Error).message}</Text>
                    <Pressable style={styles.retry} onPress={() => overviewMutation.mutate()}>
                      <Text style={styles.retryText}>Try again</Text>
                    </Pressable>
                  </View>
                ) : overviewMutation.data ? (
                  <>
                    <Text style={styles.aiSummary}>{overviewMutation.data.summary}</Text>
                    <Text style={styles.aiDisclaimer}>AI-generated from listing facts only. Keep this as a quick guide.</Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    padding: 16,
    gap: 10,
    marginBottom: 12
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 4
  },
  creatorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface
  },
  creatorAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.subtleFill
  },
  creatorAvatarLetter: { fontSize: 16, fontWeight: "600", color: colors.text },
  creatorTextWrap: { flex: 1, minWidth: 0 },
  creatorName: { fontSize: 14, fontWeight: "600", color: colors.text },
  creatorHandle: { fontSize: 12, color: colors.muted },
  creatorLink: { fontSize: 12, color: colors.accent, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  price: { fontSize: 18, fontWeight: "700", color: colors.accent },
  meta: { fontSize: 13, color: colors.muted },
  summaryLine: { fontSize: 14, color: colors.text, fontWeight: "500" },
  teaserMuted: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  sectionHeading: { fontSize: 17, fontWeight: "700", color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  label: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase" },
  block: { gap: 4 },
  muted: { fontSize: 14, color: colors.muted },
  ctaRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  buyHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  ctaHalf: { flex: 1, minWidth: 0 },
  button: {
    borderRadius: radii.button,
    paddingVertical: 12,
    ...primaryButtonOutline
  },
  buttonOutline: {
    borderRadius: radii.button,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.accentTint
  },
  buttonOutlineText: { color: colors.accentTextOnTint, fontWeight: "600", fontSize: 15 },
  buttonPressed: { transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.onAccent, fontWeight: "600", fontSize: 15 },
  linkBtn: { paddingVertical: 4 },
  linkText: { color: colors.accent, fontWeight: "600", fontSize: 15 },
  hint: { fontSize: 13, color: colors.muted, fontStyle: "italic" },
  ownerActions: { gap: 8, marginTop: 4 },
  archiveBtn: {
    borderRadius: radii.control,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
    backgroundColor: colors.surface
  },
  archiveBtnText: { color: colors.danger, fontWeight: "700", fontSize: 15 },
  aiToggle: { fontSize: 15, fontWeight: "700", color: colors.accent },
  aiBody: { marginTop: 10, gap: 8 },
  aiSummary: { fontSize: 14, color: colors.text, lineHeight: 22 },
  aiDisclaimer: { fontSize: 11, color: colors.muted },
  errorText: { color: "#b91c1c", fontSize: 14 },
  retry: { marginTop: 8 },
  retryText: { color: colors.accent, fontWeight: "600" }
});
