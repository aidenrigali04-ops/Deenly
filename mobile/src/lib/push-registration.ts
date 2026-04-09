import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { apiRequest } from "./api";

let handlerInstalled = false;

function ensureNotificationHandler() {
  if (handlerInstalled) {
    return;
  }
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    })
  });
}

/**
 * Requests notification permission (when needed), reads the Expo push token, and registers it with the API.
 * No-ops on simulators / missing EAS project id / non-mobile platforms. Ignores 503 when push is not configured server-side.
 */
export async function registerExpoPushDevice(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return;
  }
  if (!Device.isDevice) {
    return;
  }

  ensureNotificationHandler();

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let nextStatus = existing;
  if (existing !== "granted") {
    const asked = await Notifications.requestPermissionsAsync();
    nextStatus = asked.status;
  }
  if (nextStatus !== "granted") {
    return;
  }

  const projectIdRaw = Constants.expoConfig?.extra?.eas?.projectId;
  const projectId = projectIdRaw != null ? String(projectIdRaw).trim() : "";
  if (!projectId) {
    return;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = String(tokenResponse.data || "").trim();
  if (!token) {
    return;
  }

  const platform = Platform.OS === "ios" ? "ios" : "android";

  try {
    await apiRequest("/notifications/push/devices", {
      method: "POST",
      auth: true,
      body: { platform, token }
    });
  } catch {
    /* 503 when EXPO_ACCESS_TOKEN unset, or transient errors */
  }
}
