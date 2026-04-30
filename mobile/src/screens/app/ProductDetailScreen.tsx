import { useRef, useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../lib/api";
import { fetchProductOverview } from "../../lib/ai-assist";
import {
  createGuestProductCheckout,
  createProductCheckout,
  fetchProductCheckoutRewardsPreview,
  fetchCatalogProduct,
  formatMinorCurrency
} from "../../lib/monetization";
import { ProductCheckoutSheet } from "../../components/ProductCheckoutSheet";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { hapticPrimary, hapticSuccess, hapticTap } from "../../lib/haptics";
import { resolveMediaUrl } from "../../lib/media-url";
import { colors, radii } from "../../theme";
import { useAppChrome } from "../../lib/use-app-chrome";
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
  const { figma, mode } = useAppChrome();
  const queryClient = useQueryClient();
  const [aiOpen, setAiOpen] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutHandoff, setCheckoutHandoff] = useState(false);
  const [usePointsOnCheckout, setUsePointsOnCheckout] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const [offerSectionY, setOfferSectionY] = useState(0);
  const statusBarStyle = mode === "light" ? "dark" : "light";

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
    mutationFn: (opts?: {
      checkoutVariant?: "trust_first" | "speed_first";
      redeemMaxPoints?: boolean;
      redeemClientRequestId?: string;
    }) => createProductCheckout(productId, opts),
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

  const rewardsPreviewQuery = useQuery({
    queryKey: ["mobile-product-checkout-rewards-preview", productId, usePointsOnCheckout],
    queryFn: () =>
      fetchProductCheckoutRewardsPreview(productId, {
        redeemEnabled: usePointsOnCheckout
      }),
    enabled: Boolean(sessionUser) && checkoutOpen
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
    return (
      <View style={[styles.screenRoot, { backgroundColor: figma.canvas }]}>
        <StatusBar style={statusBarStyle} />
        <LoadingState label="Loading product..." surface="dark" />
      </View>
    );
  }
  if (productQuery.error) {
    return (
      <View style={[styles.screenRoot, { backgroundColor: figma.canvas }]}>
        <StatusBar style={statusBarStyle} />
        <ErrorState
          message={(productQuery.error as Error).message}
          onRetry={() => productQuery.refetch()}
          surface="dark"
        />
      </View>
    );
  }
  const product = productQuery.data;
  if (!product) {
    return (
      <View style={[styles.screenRoot, { backgroundColor: figma.canvas }]}>
        <StatusBar style={statusBarStyle} />
        <EmptyState title="Product not found" surface="dark" />
      </View>
    );
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
  const rewardsPreview = rewardsPreviewQuery.data;
  const creatorAvatarUri = resolveMediaUrl(product.creator_avatar_url) || undefined;
  const creatorHandle = product.creator_username ? `@${product.creator_username}` : null;
  const creatorName = product.creator_display_name || creatorHandle || "Creator";
  const priceLabel = formatMinorCurrency(Number(product.price_minor || 0), product.currency || "usd");

  const pointsAvailable =
    Boolean(sessionUser) &&
    Boolean(rewardsPreview?.productRewardsEligible) &&
    (Boolean(rewardsPreview?.eligible) || !usePointsOnCheckout);
  const pointsToggleDisabledReason = !sessionUser
    ? null
    : !rewardsPreview
      ? rewardsPreviewQuery.isLoading
        ? "Checking points eligibility for this product..."
        : rewardsPreviewQuery.isError
          ? "Points redemption is temporarily unavailable."
          : "Checking points eligibility for this product..."
      : !rewardsPreview.productRewardsEligible
        ? "Points are not eligible for this product."
        : !rewardsPreview.eligible
          ? "Points cannot be applied to this checkout right now."
          : null;
  const pointsDiscountLabel =
    rewardsPreview && usePointsOnCheckout && rewardsPreview.discountMinor > 0
      ? formatMinorCurrency(rewardsPreview.discountMinor, product.currency || "usd")
      : null;
  const pointsSpendLabel =
    rewardsPreview && usePointsOnCheckout && rewardsPreview.pointsToSpend > 0
      ? `${Number(rewardsPreview.pointsToSpend).toLocaleString("en-US")} pts`
      : null;
  const finalPriceLabel =
    rewardsPreview && usePointsOnCheckout && rewardsPreview.discountMinor > 0
      ? formatMinorCurrency(rewardsPreview.chargedMinor, product.currency || "usd")
      : priceLabel;

  return (
    <>
      <StatusBar style={statusBarStyle} />
      <ProductCheckoutSheet
        visible={checkoutOpen}
        title={product.title}
        priceLabel={priceLabel}
        finalPriceLabel={finalPriceLabel}
        pointsDiscountLabel={pointsDiscountLabel ?? undefined}
        pointsSpendLabel={pointsSpendLabel ?? undefined}
        pointsApplyEnabled={Boolean(pointsAvailable) && !rewardsPreviewQuery.isLoading}
        pointsApplyDisabledReason={pointsToggleDisabledReason ?? undefined}
        pointsApplyLoading={rewardsPreviewQuery.isLoading}
        pointsApplyToggle={usePointsOnCheckout}
        isGuest={!sessionUser}
        guestEmail={guestEmail}
        loading={buyPending}
        handoffState={checkoutHandoff}
        checkoutVariant={checkoutVariant}
        errorMessage={checkoutError ? (checkoutError as Error).message : undefined}
        onGuestEmailChange={setGuestEmail}
        onToggleUsePoints={(next) => {
          setUsePointsOnCheckout(next);
        }}
        onClose={() => {
          if (!buyPending) setCheckoutOpen(false);
        }}
        onConfirm={() => {
          setCheckoutHandoff(false);
          if (sessionUser) {
            const redeemClientRequestId =
              usePointsOnCheckout && rewardsPreview?.eligible
                ? `redeem_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
                : undefined;
            void checkoutMutation
              .mutateAsync({
                checkoutVariant,
                redeemMaxPoints: Boolean(usePointsOnCheckout && rewardsPreview?.eligible),
                redeemClientRequestId
              })
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
        style={[styles.root, { backgroundColor: figma.canvas }]}
        contentContainerStyle={styles.content}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: figma.card,
              borderColor: figma.glassBorder,
              shadowColor: colors.shadow
            }
          ]}
        >
          {product.creator_user_id ? (
            <Pressable
              style={styles.creatorRow}
              onPress={() => navigation.navigate("UserProfile", { id: product.creator_user_id })}
            >
              {creatorAvatarUri ? (
                <Image source={{ uri: creatorAvatarUri }} style={[styles.creatorAvatar, { borderColor: figma.glassBorder }]} />
              ) : (
                <View
                  style={[
                    styles.creatorAvatar,
                    styles.creatorAvatarFallback,
                    { borderColor: figma.glassBorder, backgroundColor: figma.glassSoft }
                  ]}
                >
                  <Text style={[styles.creatorAvatarLetter, { color: figma.text }]}>
                    {creatorName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.creatorTextWrap}>
                <Text style={[styles.creatorName, { color: figma.text }]} numberOfLines={1}>
                  {creatorName}
                </Text>
                {creatorHandle ? (
                  <Text style={[styles.creatorHandle, { color: figma.textMuted }]} numberOfLines={1}>
                    {creatorHandle}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.creatorLink, { color: figma.accentGold }]}>View profile</Text>
            </Pressable>
          ) : null}

        <Text style={[styles.title, { color: figma.text }]}>{product.title}</Text>
        <Text style={[styles.price, { color: figma.accentGold }]}>{priceLabel}</Text>
        <Text style={[styles.meta, { color: figma.textMuted }]}>
          {productTypeLabel(product.product_type)}
          {product.business_category ? ` · ${product.business_category.replace(/_/g, " ")}` : ""}
          {!isPublished ? ` · ${product.status}` : ""}
        </Text>
        <Text style={[styles.summaryLine, { color: figma.text }]}>{productTypeSummary(product.product_type)}</Text>

        {showViewOffer ? (
          <Text style={[styles.teaserMuted, { color: figma.textMuted }]}>
            Open full details for description, delivery, and exactly what buyers receive.
          </Text>
        ) : null}

        <View style={styles.ctaRow}>
          {showViewOffer ? (
            <Pressable
              style={({ pressed }) => [
                styles.buttonOutline,
                styles.ctaHalf,
                {
                  backgroundColor: figma.glassSoft,
                  borderColor: figma.glassBorder
                },
                pressed && styles.buttonPressed
              ]}
              onPress={() => {
                void hapticTap();
                scrollToFullOffer();
              }}
            >
              <Text style={[styles.buttonOutlineText, { color: figma.accentGold }]}>View offer</Text>
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
          <Text style={[styles.buyHint, { color: figma.textMuted }]}>
            Secure Stripe Checkout in your browser — Apple Pay or Google Pay appears when your device and Stripe
            settings support it.
          </Text>
        ) : null}

        {websiteOk ? (
          <Pressable
            style={styles.linkBtn}
            onPress={() => Linking.openURL(product.website_url!)}
          >
            <Text style={[styles.linkText, { color: figma.accentGold }]}>Visit website</Text>
          </Pressable>
        ) : null}

        {product.creator_user_id ? (
          <Pressable
            style={styles.linkBtn}
            onPress={() => navigation.navigate("UserProfile", { id: product.creator_user_id })}
          >
            <Text style={[styles.linkText, { color: figma.accentGold }]}>View creator profile</Text>
          </Pressable>
        ) : null}

        {isOwner && !isPublished ? (
          <Text style={[styles.hint, { color: figma.textMuted }]}>Publish this product from Creator hub so others can buy it.</Text>
        ) : null}
        {isOwner && isPublished ? (
          <View style={styles.ownerActions}>
            <Pressable
              style={[
                styles.archiveBtn,
                {
                  backgroundColor: figma.glassSoft,
                  borderColor: colors.danger
                },
                archiveProductMutation.isPending && styles.buttonDisabled
              ]}
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
          style={[
            styles.card,
            {
              backgroundColor: figma.card,
              borderColor: figma.glassBorder,
              shadowColor: colors.shadow
            }
          ]}
          onLayout={(e) => setOfferSectionY(e.nativeEvent.layout.y)}
        >
          <Text style={[styles.sectionHeading, { color: figma.text }]}>Full offer</Text>
          {product.description ? (
            <View style={styles.block}>
              <Text style={[styles.label, { color: figma.textMuted }]}>Description</Text>
              <Text style={[styles.body, { color: figma.text }]}>{product.description}</Text>
            </View>
          ) : (
            <Text style={[styles.muted, { color: figma.textMuted }]}>No short description provided.</Text>
          )}
          {product.service_details ? (
            <View style={styles.block}>
              <Text style={[styles.label, { color: figma.textMuted }]}>What you get</Text>
              <Text style={[styles.body, { color: figma.text }]}>{product.service_details}</Text>
            </View>
          ) : null}
          <View style={styles.block}>
            <Text style={[styles.label, { color: figma.textMuted }]}>Delivery</Text>
            <Text style={[styles.body, { color: figma.text }]}>
              {product.delivery_method?.trim() || "Confirmed after checkout where applicable."}
            </Text>
          </View>
        </View>

        {isPublished || isOwner ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: figma.card,
                borderColor: figma.glassBorder,
                shadowColor: colors.shadow
              }
            ]}
          >
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
              <Text style={[styles.aiToggle, { color: figma.accentGold }]}>
                {aiOpen ? "Hide quick summary" : "Quick summary"}
              </Text>
            </Pressable>
            {aiOpen ? (
              <View style={styles.aiBody}>
                {overviewMutation.isPending ? (
                  <Text style={[styles.muted, { color: figma.textMuted }]}>Generating quick summary…</Text>
                ) : overviewMutation.isError ? (
                  <View>
                    <Text style={styles.errorText}>{(overviewMutation.error as Error).message}</Text>
                    <Pressable style={styles.retry} onPress={() => overviewMutation.mutate()}>
                      <Text style={[styles.retryText, { color: figma.accentGold }]}>Try again</Text>
                    </Pressable>
                  </View>
                ) : overviewMutation.data ? (
                  <>
                    <Text style={[styles.aiSummary, { color: figma.text }]}>{overviewMutation.data.summary}</Text>
                    <Text style={[styles.aiDisclaimer, { color: figma.textMuted }]}>
                      AI-generated from listing facts only. Keep this as a quick guide.
                    </Text>
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
  screenRoot: { flex: 1 },
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  card: {
    borderRadius: radii.feedCard,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2
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
    borderColor: "rgba(255,255,255,0.1)"
  },
  creatorAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  creatorAvatarLetter: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  creatorTextWrap: { flex: 1, minWidth: 0 },
  creatorName: { fontSize: 14, fontWeight: "600" },
  creatorHandle: { fontSize: 12 },
  creatorLink: { fontSize: 12, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.4 },
  price: { fontSize: 32, fontWeight: "700", letterSpacing: -0.5 },
  meta: { fontSize: 13, fontWeight: "500" },
  summaryLine: { fontSize: 15, fontWeight: "600", lineHeight: 22 },
  teaserMuted: { fontSize: 13, lineHeight: 20 },
  sectionHeading: { fontSize: 17, fontWeight: "700", letterSpacing: -0.25 },
  body: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  block: { gap: 4 },
  muted: { fontSize: 14 },
  ctaRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  buyHint: { fontSize: 12, marginTop: 2, lineHeight: 18 },
  ctaHalf: { flex: 1, minWidth: 0 },
  button: {
    borderRadius: radii.button,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.accent
  },
  buttonOutline: {
    borderRadius: radii.button,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth
  },
  buttonOutlineText: { fontWeight: "600", fontSize: 15 },
  buttonPressed: { transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.onAccent, fontWeight: "600", fontSize: 15 },
  linkBtn: { paddingVertical: 4 },
  linkText: { fontWeight: "600", fontSize: 15, letterSpacing: -0.15 },
  hint: { fontSize: 13, fontStyle: "italic" },
  ownerActions: { gap: 8, marginTop: 4 },
  archiveBtn: {
    borderRadius: radii.control,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth
  },
  archiveBtnText: { color: colors.danger, fontWeight: "700", fontSize: 15 },
  aiToggle: { fontSize: 15, fontWeight: "700", letterSpacing: -0.15 },
  aiBody: { marginTop: 10, gap: 8 },
  aiSummary: { fontSize: 14, lineHeight: 22 },
  aiDisclaimer: { fontSize: 11, lineHeight: 16 },
  errorText: { color: colors.danger, fontSize: 14 },
  retry: { marginTop: 8 },
  retryText: { fontWeight: "600" }
});
