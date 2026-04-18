import { useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AppVideoView } from "../../components/AppVideoView";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../lib/api";
import { resolveMediaUrl } from "../../lib/media-url";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { enqueueMutation } from "../../lib/mutation-queue";
import { colors, figmaMobile, primaryButtonOutline, radii } from "../../theme";
import type { FeedItem } from "../../types";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { createGuestProductCheckout, createProductCheckout, formatMinorCurrency } from "../../lib/monetization";
import { ProductCheckoutSheet } from "../../components/ProductCheckoutSheet";
import { hapticPrimary, hapticSuccess, hapticTap } from "../../lib/haptics";
import { useSessionStore } from "../../store/session-store";
import { getWebAppBaseUrl } from "../../lib/web-app";

type PostDetail = FeedItem & {
  view_count?: number;
  avg_watch_time_ms?: number;
  avg_completion_rate?: number;
};

type Props = NativeStackScreenProps<RootStackParamList, "PostDetail">;

function resolveCheckoutVariant(seed: number): "trust_first" | "speed_first" {
  return seed % 2 === 0 ? "trust_first" : "speed_first";
}

function isImageMedia(post: PostDetail) {
  if (post.media_mime_type?.startsWith("image/")) {
    return true;
  }
  if (!post.media_url) {
    return false;
  }
  return /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(post.media_url);
}

export function PostDetailScreen({ route, navigation }: Props) {
  const { id: postId } = route.params;
  const checkoutVariant = resolveCheckoutVariant(postId);
  const [comment, setComment] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportCategory, setReportCategory] = useState("other");
  const [reportEvidenceUrl, setReportEvidenceUrl] = useState("");
  const [message, setMessage] = useState("");
  const [mediaFailed, setMediaFailed] = useState(false);
  const [liked, setLiked] = useState(false);
  const [benefitedCount, setBenefitedCount] = useState(0);
  const [checkoutProductId, setCheckoutProductId] = useState<number | null>(null);
  const [checkoutProductTitle, setCheckoutProductTitle] = useState("Product");
  const [checkoutPriceLabel, setCheckoutPriceLabel] = useState("");
  const [guestCheckoutEmail, setGuestCheckoutEmail] = useState("");
  const [checkoutHandoff, setCheckoutHandoff] = useState(false);
  const sessionUser = useSessionStore((state) => state.user);
  const queryClient = useQueryClient();

  const postQuery = useQuery({
    queryKey: ["mobile-post-detail", postId],
    queryFn: () => apiRequest<PostDetail>(`/posts/${postId}`)
  });

  const viewMutation = useMutation({
    mutationFn: (completionRate: number) =>
      apiRequest("/interactions/view", {
        method: "POST",
        auth: true,
        body: {
          postId,
          watchTimeMs: 12000,
          completionRate
        }
      })
  });

  useEffect(() => {
    if (postQuery.data) {
      viewMutation.mutate(80);
    }
  }, [postQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMediaFailed(false);
  }, [postId, postQuery.data?.media_url]);
  useEffect(() => {
    setLiked(Boolean(postQuery.data?.liked_by_viewer));
    setBenefitedCount(Number(postQuery.data?.benefited_count || 0));
  }, [postQuery.data?.liked_by_viewer, postQuery.data?.benefited_count]);

  const interact = useMutation({
    mutationFn: (payload: { interactionType: string; commentText?: string }) =>
      apiRequest("/interactions", {
        method: "POST",
        auth: true,
        body: { postId, ...payload }
      }),
    onSuccess: () => postQuery.refetch()
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      apiRequest("/reports", {
        method: "POST",
        auth: true,
        body: {
          targetType: "post",
          targetId: String(postId),
          reason: reportReason,
          category: reportCategory,
          evidenceUrl: reportEvidenceUrl || undefined,
          notes: ""
        }
      })
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/posts/${postId}`, {
        method: "DELETE",
        auth: true
      }),
    onSuccess: async () => {
      const detail = queryClient.getQueryData<PostDetail>(["mobile-post-detail", postId]);
      const authorId = detail?.author_id;
      await queryClient.invalidateQueries({ queryKey: ["mobile-feed"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-feed-reels"] });
      if (authorId != null) {
        await queryClient.invalidateQueries({ queryKey: ["mobile-account-posts", authorId] });
      }
      await queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "mobile-search-posts"
      });
      queryClient.removeQueries({ queryKey: ["mobile-post-detail", postId] });
      navigation.goBack();
    },
    onError: (error) => {
      setMessage(error instanceof ApiError ? error.message : "Could not delete post.");
    }
  });

  const stats = useMemo(() => {
    const post = postQuery.data;
    if (!post) {
      return null;
    }
    return [
      `Likes: ${benefitedCount}`,
      `Comments: ${post.comment_count || 0}`,
      `Views: ${post.view_count || 0}`,
      `Avg watch: ${post.avg_watch_time_ms || 0}ms`,
      `Completion: ${post.avg_completion_rate || 0}%`
    ];
  }, [postQuery.data, benefitedCount]);
  const productCheckoutMutation = useMutation({
    mutationFn: (productId: number) => createProductCheckout(productId, { checkoutVariant }),
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
  const guestProductCheckoutMutation = useMutation({
    mutationFn: ({ productId, email }: { productId: number; email?: string }) =>
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
  const buyPending = productCheckoutMutation.isPending || guestProductCheckoutMutation.isPending;
  const checkoutError = productCheckoutMutation.error || guestProductCheckoutMutation.error;

  const openCheckoutSheet = (productId: number, title: string, priceMinor: number, currency: string) => {
    setCheckoutProductId(productId);
    setCheckoutProductTitle(title || "Product");
    setCheckoutPriceLabel(formatMinorCurrency(priceMinor, currency || "usd"));
  };
  if (postQuery.isLoading) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar style="light" />
        <LoadingState label="Loading post..." surface="dark" />
      </View>
    );
  }
  if (postQuery.error) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar style="light" />
        <ErrorState message={(postQuery.error as Error).message} onRetry={postQuery.refetch} surface="dark" />
      </View>
    );
  }
  if (!postQuery.data) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar style="light" />
        <EmptyState title="Post not found" surface="dark" />
      </View>
    );
  }

  const post = postQuery.data;
  const isOwnAttachedProduct =
    Boolean(post.attached_product_id) && sessionUser?.id === post.author_id;
  const mediaUri = resolveMediaUrl(post.media_url) || undefined;
  const canRenderMedia = Boolean(mediaUri) && !mediaFailed;

  return (
    <>
      <StatusBar style="light" />
      <ProductCheckoutSheet
        visible={checkoutProductId !== null}
        title={checkoutProductTitle}
        priceLabel={checkoutPriceLabel}
        isGuest={!sessionUser}
        guestEmail={guestCheckoutEmail}
        loading={buyPending}
        handoffState={checkoutHandoff}
        checkoutVariant={checkoutVariant}
        errorMessage={checkoutError ? (checkoutError as Error).message : undefined}
        onGuestEmailChange={setGuestCheckoutEmail}
        onClose={() => {
          if (!buyPending) {
            setCheckoutProductId(null);
          }
        }}
        onConfirm={() => {
          setCheckoutHandoff(false);
          if (!checkoutProductId) return;
          if (sessionUser) {
            productCheckoutMutation
              .mutateAsync(checkoutProductId)
              .then(() => setCheckoutProductId(null))
              .catch(() => undefined);
            return;
          }
          const nextEmail = guestCheckoutEmail.trim();
          guestProductCheckoutMutation
            .mutateAsync({ productId: checkoutProductId, email: nextEmail || undefined })
            .then(() => setCheckoutProductId(null))
            .catch(() => undefined);
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.cardMain}>
        <Text style={styles.title}>{post.content}</Text>
        <Text style={styles.muted}>{post.author_display_name}</Text>
        {canRenderMedia ? (
          isImageMedia(post) ? (
            <Image
              source={{ uri: mediaUri }}
              style={styles.video}
              resizeMode="cover"
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <AppVideoView
              uri={mediaUri!}
              style={styles.video}
              contentFit="cover"
              nativeControls
              loop={false}
              onError={() => setMediaFailed(true)}
            />
          )
        ) : post.media_url ? (
          <Text style={styles.muted}>Media unavailable right now.</Text>
        ) : null}
        <View style={styles.metrics}>
          {stats?.map((value) => (
            <Text key={value} style={styles.muted}>
              {value}
            </Text>
          ))}
        </View>
        <View style={styles.row}>
          <Pressable
            style={styles.buttonSecondary}
            onPress={async () => {
              try {
                const nextLiked = !liked;
                if (nextLiked) {
                  await interact.mutateAsync({ interactionType: "benefited" });
                } else {
                  await apiRequest("/interactions", {
                    method: "DELETE",
                    auth: true,
                    body: { postId, interactionType: "benefited" }
                  });
                  await postQuery.refetch();
                }
                setLiked(nextLiked);
                setBenefitedCount((value) => Math.max(0, value + (nextLiked ? 1 : -1)));
                setMessage(nextLiked ? "Liked." : "Like removed.");
              } catch (error) {
                if (error instanceof ApiError && error.status === 0) {
                  await enqueueMutation({
                    path: "/interactions",
                    method: "POST",
                    auth: true,
                    body: { postId, interactionType: "benefited" }
                  });
                  setMessage("Offline: like queued.");
                  return;
                }
                setMessage((error as Error).message || "Unable to apply interaction.");
              }
            }}
          >
            <Text style={styles.buttonText}>{liked ? "Unlike" : "Like"}</Text>
          </Pressable>
          <Pressable
            style={styles.buttonSecondary}
            onPress={async () => {
              try {
                await interact.mutateAsync({ interactionType: "reflect_later" });
                setMessage("Saved to reflect later.");
              } catch (error) {
                if (error instanceof ApiError && error.status === 0) {
                  await enqueueMutation({
                    path: "/interactions",
                    method: "POST",
                    auth: true,
                    body: { postId, interactionType: "reflect_later" }
                  });
                  setMessage("Offline: reflect-later action queued.");
                  return;
                }
                setMessage((error as Error).message || "Unable to apply interaction.");
              }
            }}
          >
            <Text style={styles.buttonText}>Reflect Later</Text>
          </Pressable>
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => navigation.navigate("UserProfile", { id: post.author_id })}
          >
            <Text style={styles.buttonText}>Author</Text>
          </Pressable>
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => {
              const url = `${getWebAppBaseUrl().replace(/\/$/, "")}/posts/${postId}`;
              void Share.share({ message: url, url }).catch(() => null);
            }}
          >
            <Text style={styles.buttonText}>Share</Text>
          </Pressable>
        </View>
        {sessionUser?.id === post.author_id ? (
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {deleteMutation.isPending ? "Deleting..." : "Delete post"}
            </Text>
          </Pressable>
        ) : null}
        {post.attached_product_id ? (
          <View style={styles.cardInset}>
            <Text style={styles.label}>{post.attached_product_title || "Creator product"}</Text>
            <Text style={styles.muted}>
              {formatMinorCurrency(
                Number(post.attached_product_price_minor || 0),
                post.attached_product_currency || "usd"
              )}
            </Text>
            <View style={styles.productCtaRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.buttonSecondary,
                  styles.productCtaHalf,
                  pressed && styles.buttonPressed
                ]}
                onPress={() => {
                  void hapticTap();
                  navigation.navigate("ProductDetail", { productId: post.attached_product_id as number });
                }}
              >
                <Text style={styles.buttonText}>View offer</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  isOwnAttachedProduct || buyPending ? styles.buttonSecondary : styles.buttonPrimaryBuy,
                  styles.productCtaHalf,
                  pressed && !isOwnAttachedProduct && !buyPending && styles.buttonPressed
                ]}
                onPress={() => {
                  if (isOwnAttachedProduct) return;
                  void hapticPrimary();
                  openCheckoutSheet(
                    post.attached_product_id as number,
                    post.attached_product_title || "Creator product",
                    Number(post.attached_product_price_minor || 0),
                    post.attached_product_currency || "usd"
                  );
                }}
                disabled={
                  isOwnAttachedProduct ||
                  buyPending
                }
              >
                <Text
                  style={
                    isOwnAttachedProduct || buyPending ? styles.buttonText : styles.buttonPrimaryBuyText
                  }
                >
                  {isOwnAttachedProduct
                    ? "Your product"
                    : buyPending
                      ? "Opening..."
                      : "Buy securely"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.cardMain}>
        <Text style={styles.label}>Add comment</Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="Write a respectful comment..."
          placeholderTextColor={figmaMobile.textMuted}
          value={comment}
          onChangeText={setComment}
        />
        <Pressable
          style={styles.button}
          onPress={async () => {
            if (!comment.trim()) return;
            try {
              await interact.mutateAsync({ interactionType: "comment", commentText: comment });
              setComment("");
              setMessage("Comment posted.");
            } catch (error) {
              if (error instanceof ApiError && error.status === 0) {
                await enqueueMutation({
                  path: "/interactions",
                  method: "POST",
                  auth: true,
                  body: { postId, interactionType: "comment", commentText: comment }
                });
                setComment("");
                setMessage("Offline: comment queued for sync.");
                return;
              }
              setMessage((error as Error).message || "Unable to post comment.");
            }
          }}
        >
          <Text style={styles.buttonPrimaryText}>Post comment</Text>
        </Pressable>
      </View>

      <View style={styles.cardMain}>
        <Text style={styles.label}>Report post</Text>
        <Text style={styles.muted}>
          Reports are reviewed by moderators. During beta we aim to triage serious safety issues within one business day.
        </Text>
        <TextInput
          style={styles.inputSingle}
          placeholder="Reason"
          placeholderTextColor={figmaMobile.textMuted}
          value={reportReason}
          onChangeText={setReportReason}
        />
        <TextInput
          style={styles.inputSingle}
          placeholder="Category (haram_content, misinformation, harassment, spam, other)"
          placeholderTextColor={figmaMobile.textMuted}
          value={reportCategory}
          onChangeText={setReportCategory}
        />
        <TextInput
          style={styles.inputSingle}
          placeholder="Evidence URL (optional)"
          placeholderTextColor={figmaMobile.textMuted}
          value={reportEvidenceUrl}
          onChangeText={setReportEvidenceUrl}
        />
        <Pressable
          style={styles.buttonSecondary}
          onPress={async () => {
            try {
              await reportMutation.mutateAsync();
              setMessage("Report submitted.");
            } catch (error) {
              if (error instanceof ApiError && error.status === 0) {
                await enqueueMutation({
                  path: "/reports",
                  method: "POST",
                  auth: true,
                  body: {
                    targetType: "post",
                    targetId: String(postId),
                    reason: reportReason,
                    category: reportCategory,
                    evidenceUrl: reportEvidenceUrl || undefined,
                    notes: ""
                  }
                });
                setMessage("Offline: report queued for sync.");
                return;
              }
              setMessage((error as Error).message || "Unable to report post.");
            }
          }}
        >
          <Text style={styles.buttonText}>Submit report</Text>
        </Pressable>
      </View>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: figmaMobile.canvas,
    padding: 16,
    justifyContent: "center"
  },
  container: {
    flex: 1,
    backgroundColor: figmaMobile.canvas
  },
  content: {
    padding: 14,
    gap: 12,
    paddingBottom: 28
  },
  cardMain: {
    backgroundColor: figmaMobile.card,
    borderColor: figmaMobile.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.feedCard,
    padding: 16,
    gap: 10
  },
  cardInset: {
    backgroundColor: figmaMobile.glassSoft,
    borderColor: figmaMobile.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    padding: 12,
    gap: 8,
    marginTop: 4
  },
  title: {
    color: figmaMobile.text,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24
  },
  muted: {
    color: figmaMobile.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
  metrics: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  video: {
    width: "100%",
    height: 240,
    borderRadius: radii.control,
    backgroundColor: "#2a2a2a"
  },
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  label: {
    color: figmaMobile.text,
    fontWeight: "700",
    fontSize: 15
  },
  input: {
    borderColor: figmaMobile.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    minHeight: 100,
    color: figmaMobile.text,
    backgroundColor: figmaMobile.glassSoft,
    padding: 12,
    textAlignVertical: "top"
  },
  inputSingle: {
    borderColor: figmaMobile.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    color: figmaMobile.text,
    backgroundColor: figmaMobile.glassSoft,
    padding: 12
  },
  button: {
    borderRadius: radii.button,
    paddingVertical: 12,
    ...primaryButtonOutline
  },
  buttonPrimaryText: {
    color: colors.onAccent,
    fontWeight: "600",
    fontSize: 16
  },
  buttonSecondary: {
    borderColor: figmaMobile.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: figmaMobile.glassSoft
  },
  buttonPrimaryBuy: {
    borderRadius: radii.button,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: figmaMobile.brandTeal,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonPrimaryBuyText: {
    color: colors.onAccent,
    fontWeight: "600",
    fontSize: 14
  },
  buttonPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.92
  },
  buttonText: {
    color: figmaMobile.text,
    fontWeight: "600",
    fontSize: 14
  },
  productCtaRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4
  },
  productCtaHalf: {
    flex: 1,
    alignItems: "center"
  }
});
