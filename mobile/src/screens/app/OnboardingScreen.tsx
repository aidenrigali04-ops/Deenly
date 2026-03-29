import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { colors } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

const options = ["post", "marketplace", "reel"] as const;

type InterestsResponse = { items: string[] };
type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

export function OnboardingScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const interestsQuery = useQuery({
    queryKey: ["mobile-interests"],
    queryFn: () => apiRequest<InterestsResponse>("/users/me/interests", { auth: true })
  });
  const mutation = useMutation({
    mutationFn: (interests: string[]) =>
      apiRequest<InterestsResponse>("/users/me/interests", {
        method: "PUT",
        auth: true,
        body: { interests }
      }),
    onSuccess: () => navigation.goBack()
  });

  const active = selected.length ? selected : interestsQuery.data?.items || [];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Interest Setup</Text>
      <Text style={styles.muted}>Choose what should be prioritized in your feed.</Text>
      <View style={styles.rowWrap}>
        {options.map((option) => {
          const enabled = active.includes(option);
          return (
            <Pressable
              key={option}
              style={[styles.chip, enabled ? styles.chipActive : null]}
              onPress={() => {
                if (enabled) {
                  setSelected(active.filter((item) => item !== option));
                } else {
                  setSelected([...new Set([...active, option])]);
                }
              }}
            >
              <Text style={styles.chipText}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable style={styles.button} onPress={() => mutation.mutate(active)}>
        <Text style={styles.buttonText}>{mutation.isPending ? "Saving..." : "Save preferences"}</Text>
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
  muted: { color: colors.muted },
  rowWrap: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  chipActive: {
    backgroundColor: colors.accent
  },
  chipText: {
    color: colors.text,
    fontWeight: "600"
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonText: {
    color: colors.onAccent,
    fontWeight: "700"
  }
});
