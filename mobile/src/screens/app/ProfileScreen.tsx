import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import { fetchSessionMe } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors, radii } from "../../theme";
import type { FeedItem } from "../../types";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { resolveMediaUrl } from "../../lib/media-url";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "AccountTab">,
  NativeStackScreenProps<RootStackParamList>
>;

export function ProfileScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<"posts" | "media">("posts");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ["mobile-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const profileQuery = useQuery({
    queryKey: ["mobile-account-profile"],
    queryFn: () =>
      apiRequest<{
        user_id: number;
        display_name: string;
        bio: string | null;
        avatar_url?: string | null;
        business_offering?: string | null;
        website_url?: string | null;
        posts_count: number;
        followers_count: number;
        following_count: number;
        likes_received_count: number;
        likes_given_count: number;
      }>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const postsQuery = useQuery({
    queryKey: ["mobile-account-posts", sessionQuery.data?.id],
    queryFn: () =>
      apiRequest<{ items: FeedItem[] }>(`/feed?authorId=${sessionQuery.data?.id}&limit=40`, {
        auth: true
      }),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const likeMutation = useMutation({
    mutationFn: (postId: number) =>
      apiRequest("/interactions", {
        method: "POST",
        auth: true,
        body: {
          postId,
          interactionType: "benefited"
        }
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile-account-posts", sessionQuery.data?.id] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-account-profile"] })
      ]);
    }
  });

  const items = postsQuery.data?.items || [];
  const visibleItems = activeTab === "media" ? items.filter((item) => Boolean(item.media_url)) : items;
  const avatarUri = resolveMediaUrl(profileQuery.data?.avatar_url);
  const tileSize = Math.floor((width - 32 - 8) / 3);
  const p = profileQuery.data;

  const uploadAvatar = async () => {
    if (!profileQuery.data) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["image/*"],
      copyToCacheDirectory: true
    });
    if (picked.canceled || picked.assets.length === 0) {
      return;
    }
    const file = picked.assets[0];
    setAvatarUploading(true);
    try {
      const signature = await apiRequest<{
        uploadUrl: string;
        headers: Record<string, string>;
        key: string;
      }>("/media/upload-signature", {
        method: "POST",
        auth: true,
        body: {
          mediaType: "image",
          mimeType: file.mimeType || "image/jpeg",
          originalFilename: file.name || "avatar.jpg",
          fileSizeBytes: file.size || 1
        }
      });
      const fileResponse = await fetch(file.uri);
      const fileBlob = await fileResponse.blob();
      const uploadResponse = await fetch(signature.uploadUrl, {
        method: "PUT",
        headers: signature.headers,
        body: fileBlob
      });
      if (!uploadResponse.ok) {
        throw new Error("Unable to upload profile photo.");
      }
      await apiRequest("/users/me", {
        method: "PUT",
        auth: true,
        body: {
          displayName: profileQuery.data.display_name,
          bio: profileQuery.data.bio,
          avatarUrl: signature.key,
          businessOffering: profileQuery.data.business_offering ?? null,
          websiteUrl: profileQuery.data.website_url ?? null
        }
      });
      await queryClient.invalidateQueries({ queryKey: ["mobile-account-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-feed"] });
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <Text style={styles.heading}>Profile</Text>
        <Pressable
          onPress={() => navigation.navigate("Settings")}
          style={({ pressed }) => [styles.settingsBtn, pressed && styles.settingsBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Text style={styles.settingsBtnText}>Settings</Text>
        </Pressable>
      </View>

      <Pressable style={styles.addBusinessCta} onPress={() => navigation.navigate("AddBusiness")}>
        <Text style={styles.addBusinessCtaText}>Add your business</Text>
      </Pressable>

      {sessionQuery.isLoading ? <LoadingState label="Loading profile..." /> : null}
      {sessionQuery.error ? <ErrorState message={(sessionQuery.error as Error).message} /> : null}
      {!sessionQuery.isLoading && !sessionQuery.error && !sessionQuery.data ? (
        <EmptyState title="Profile unavailable" />
      ) : null}

      {sessionQuery.data ? (
        <View style={styles.card}>
          {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" /> : null}
          <Text style={styles.title}>{sessionQuery.data.email}</Text>
          <Text style={styles.muted}>@{sessionQuery.data.username || "unknown"}</Text>
          {p ? (
            <Text style={styles.statsLine}>
              {p.posts_count} posts · {p.followers_count} followers · {p.following_count} following
            </Text>
          ) : null}
          <Pressable style={styles.buttonSecondary} onPress={uploadAvatar} disabled={avatarUploading}>
            <Text style={styles.buttonText}>{avatarUploading ? "Uploading..." : "Change photo"}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.row}>
        <Pressable
          style={[styles.buttonSecondary, activeTab === "posts" ? styles.buttonActive : null]}
          onPress={() => setActiveTab("posts")}
        >
          <Text style={[styles.buttonText, activeTab === "posts" ? styles.buttonTextActive : null]}>Posts</Text>
        </Pressable>
        <Pressable
          style={[styles.buttonSecondary, activeTab === "media" ? styles.buttonActive : null]}
          onPress={() => setActiveTab("media")}
        >
          <Text style={[styles.buttonText, activeTab === "media" ? styles.buttonTextActive : null]}>Media</Text>
        </Pressable>
      </View>

      {postsQuery.isLoading ? <LoadingState label="Loading posts..." /> : null}
      {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
      {!postsQuery.isLoading && !postsQuery.error && visibleItems.length === 0 ? (
        <EmptyState title={activeTab === "posts" ? "No posts yet" : "No media yet"} />
      ) : null}

      <View style={styles.grid}>
        {visibleItems.map((item) => {
          const mediaUrl = resolveMediaUrl(item.media_url);
          const isImage = Boolean(item.media_mime_type?.startsWith("image/"));
          const isVideo = Boolean(item.media_mime_type?.startsWith("video/"));
          const fallbackLabel = item.content?.trim().slice(0, 20) || "Post";
          return (
            <View key={item.id} style={[styles.tile, { width: tileSize, height: tileSize }]}>
              <Pressable
                style={styles.tileOpen}
                onPress={() => navigation.navigate("PostDetail", { id: item.id })}
              >
                {mediaUrl && isImage ? (
                  <Image source={{ uri: mediaUrl }} style={styles.tileImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.tileFallback, isVideo ? styles.tileFallbackVideo : null]}>
                    <Text style={styles.tileFallbackText}>{isVideo ? "Video" : fallbackLabel}</Text>
                  </View>
                )}
                {isVideo ? (
                  <View style={styles.tileBadge}>
                    <Text style={styles.tileBadgeText}>Video</Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                style={styles.tileLike}
                onPress={() => likeMutation.mutate(item.id)}
                disabled={likeMutation.isPending}
              >
                <Text style={styles.tileLikeText}>{likeMutation.isPending ? "..." : "Like"}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Feed & app</Text>
        <Text style={styles.muted}>Interests, default tabs, and how Deenly opens for you.</Text>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("Onboarding")}>
          <Text style={styles.buttonText}>Setup & feed</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 16,
    gap: 14
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  heading: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700"
  },
  settingsBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  settingsBtnPressed: {
    opacity: 0.85
  },
  settingsBtnText: {
    fontWeight: "700",
    fontSize: 14,
    color: colors.accent
  },
  addBusinessCta: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  addBusinessCtaText: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 14
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.panel,
    padding: 16,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 16
      },
      android: { elevation: 2 }
    })
  },
  title: {
    color: colors.text,
    fontWeight: "700"
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border
  },
  muted: {
    color: colors.muted
  },
  statsLine: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "600"
  },
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4
  },
  tile: {
    position: "relative",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
    borderRadius: radii.control
  },
  tileOpen: {
    flex: 1
  },
  tileImage: {
    height: "100%",
    width: "100%"
  },
  tileFallback: {
    height: "100%",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: 6
  },
  tileFallbackVideo: {
    backgroundColor: "#1f2937"
  },
  tileFallbackText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center"
  },
  tileBadge: {
    position: "absolute",
    right: 6,
    top: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.88)"
  },
  tileBadgeText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: "700"
  },
  tileLike: {
    position: "absolute",
    left: 6,
    top: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.88)"
  },
  tileLikeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "700"
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    alignSelf: "flex-start"
  },
  buttonGhost: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 4
  },
  buttonGhostText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted
  },
  buttonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  },
  buttonTextActive: {
    color: colors.onAccent
  }
});
