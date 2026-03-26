import { FeedScreen } from "./FeedScreen";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "MarketplaceTab">,
  NativeStackScreenProps<RootStackParamList>
>;

export function MarketplaceFeedScreen(props: Props) {
  return <FeedScreen {...props} feedVariant="marketplace" />;
}
