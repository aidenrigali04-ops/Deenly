import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";

type ReflectResponse = {
  items: {
    id: number;
    post_id: number;
    content: string;
    post_type: string;
  }[];
};

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "ReflectTab">,
  NativeStackScreenProps<RootStackParamList>
>;

export function ReflectLaterScreen({ navigation }: Props) {
  const query = useQuery({
    queryKey: ["mobile-reflect-later"],
    queryFn: () =>
      apiRequest<ReflectResponse>("/interactions/me?type=reflect_later&limit=50", {
        auth: true
      })
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Reflect Later</Text>
      {query.isLoading ? <LoadingState label="Loading reflections..." /> : null}
      {query.error ? <ErrorState message={(query.error as Error).message} /> : null}
      {!query.isLoading && !query.error && (query.data?.items.length || 0) === 0 ? (
        <EmptyState title="No saved reflections yet." />
      ) : null}
      <View style={styles.stack}>
        {query.data?.items.map((item) => (
          <Text
            key={item.id}
            style={styles.item}
            onPress={() => navigation.navigate("PostDetail", { id: item.post_id })}
          >
            [{item.post_type}] {item.content}
          </Text>
        ))}
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
    padding: 14,
    gap: 12
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700"
  },
  stack: {
    gap: 10
  },
  item: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    padding: 12
  }
});
