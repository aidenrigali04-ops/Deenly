import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "deenly_mobile_access_token";
const REFRESH_TOKEN_KEY = "deenly_mobile_refresh_token";

let secureStoreAvailability: boolean | null = null;

async function canUseSecureStore() {
  if (secureStoreAvailability !== null) {
    return secureStoreAvailability;
  }
  try {
    secureStoreAvailability = await SecureStore.isAvailableAsync();
    return secureStoreAvailability;
  } catch {
    secureStoreAvailability = false;
    return false;
  }
}

async function setRefreshToken(refreshToken: string) {
  if (await canUseSecureStore()) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    return;
  }
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

async function removeRefreshToken() {
  if (await canUseSecureStore()) {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    return;
  }
  await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function setTokens(accessToken: string, refreshToken: string) {
  await Promise.all([AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken), setRefreshToken(refreshToken)]);
}

export async function getAccessToken() {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken() {
  if (await canUseSecureStore()) {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  }
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function clearTokens() {
  await Promise.all([AsyncStorage.removeItem(ACCESS_TOKEN_KEY), removeRefreshToken()]);
}
