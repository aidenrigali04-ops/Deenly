import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, apiRequest } from "../../lib/api";
import { colors, radii, shadows, spacing } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "EditProfile">;

type MeProfile = {
  display_name: string;
  bio: string | null;
  business_offering: string | null;
  website_url: string | null;
};

export function EditProfileScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["mobile-edit-profile"],
    queryFn: () => apiRequest<MeProfile>("/users/me", { auth: true })
  });
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [businessOffering, setBusinessOffering] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const p = profileQuery.data;
    if (!p) return;
    setDisplayName(p.display_name || "");
    setBio(p.bio || "");
    setBusinessOffering(p.business_offering || "");
    setWebsiteUrl(p.website_url || "");
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("/users/me", {
        method: "PUT",
        auth: true,
        body: {
          displayName: displayName.trim(),
          bio: bio.trim() || null,
          businessOffering: businessOffering.trim() || null,
          websiteUrl: websiteUrl.trim() || null
        }
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-edit-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-account-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-create-profile"] });
      navigation.goBack();
    }
  });

  if (profileQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.lede}>This is what others see on your profile and in search.</Text>
        <View style={[styles.formCard, shadows.card]}>
          <Text style={[styles.label, styles.labelFirst]}>Display name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Name as it should appear"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            placeholder="Short introduction"
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.label}>Business line</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={businessOffering}
            onChangeText={setBusinessOffering}
            placeholder="One line: what you offer"
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.label}>Website</Text>
          <TextInput
            style={styles.input}
            value={websiteUrl}
            onChangeText={setWebsiteUrl}
            placeholder="https://"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.saveBtn, saveMutation.isPending && styles.saveBtnDisabled]}
          disabled={saveMutation.isPending}
          onPress={() => {
            setError("");
            if (displayName.trim().length < 2) {
              setError("Display name must be at least 2 characters.");
              return;
            }
            saveMutation.mutate(undefined, {
              onError: (e) => {
                setError(e instanceof ApiError ? e.message : "Could not save.");
              }
            });
          }}
        >
          <Text style={styles.saveBtnText}>{saveMutation.isPending ? "Saving…" : "Save changes"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 12,
    paddingBottom: spacing.screenBottom,
    gap: 16
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  lede: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 21,
    letterSpacing: -0.2,
    marginBottom: 4
  },
  formCard: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    padding: 18,
    gap: 6
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 14
  },
  labelFirst: { marginTop: 0 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    letterSpacing: -0.2
  },
  textArea: { minHeight: 80 },
  error: { color: colors.danger, fontSize: 14, marginTop: 4 },
  saveBtn: {
    marginTop: 4,
    backgroundColor: colors.accent,
    borderRadius: radii.control,
    paddingVertical: 15,
    alignItems: "center"
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: colors.onAccent, fontSize: 16, fontWeight: "600", letterSpacing: -0.2 }
});
