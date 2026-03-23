import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, apiRequest } from "../../lib/api";
import { colors } from "../../theme";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";

type CreatePostResponse = { id: number };
type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "CreateTab">,
  NativeStackScreenProps<RootStackParamList>
>;

export function CreateScreen({ navigation }: Props) {
  const [postType, setPostType] = useState<"community" | "recitation" | "short_video">(
    "community"
  );
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const createPost = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      const post = await apiRequest<CreatePostResponse>("/posts", {
        method: "POST",
        auth: true,
        body: {
          postType,
          content
        }
      });
      setContent("");
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={createPost} disabled={isSubmitting}>
        <Text style={styles.buttonText}>{isSubmitting ? "Publishing..." : "Publish"}</Text>
      </Pressable>
      <Text style={styles.note}>
        Mobile file upload is next (signed upload + attach). Text post creation is ready now.
      </Text>
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
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonText: {
    color: colors.background,
    fontWeight: "700"
  },
  error: {
    color: colors.danger
  },
  note: {
    color: colors.muted,
    fontSize: 12
  }
});
