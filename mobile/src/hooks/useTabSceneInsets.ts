import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Bottom padding so scroll content clears the tab bar + home indicator. */
export function useTabSceneBottomPadding(extra = 16) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  return tabBarHeight + Math.max(insets.bottom, 8) + extra;
}

/** For root-stack screens outside the tab bar (e.g. CreateFlow). Avoids `useBottomTabBarHeight` throw. */
export function useDetachedSceneBottomPadding(extra = 24) {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 12) + extra;
}

/** Top inset for tab-root screens without their own header bar. */
export function useTabSceneTopPadding(extra = 10) {
  const insets = useSafeAreaInsets();
  return insets.top + extra;
}
