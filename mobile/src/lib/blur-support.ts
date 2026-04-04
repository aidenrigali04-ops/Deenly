import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";

/**
 * `expo-blur` is not available in the Expo Go shell, which surfaces as
 * "Unimplemented component: ViewManagerAdapter_ExpoBlurView".
 *
 * Use native blur on iOS only when not in Expo Go (dev client / standalone / bare).
 * Android, web, and Expo Go use frosted `View` fallbacks.
 */
export function supportsNativeBlur(): boolean {
  if (Platform.OS !== "ios") {
    return false;
  }
  if (isRunningInExpoGo()) {
    return false;
  }
  return true;
}
