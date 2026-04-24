import "react-native-gesture-handler";
import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import * as Sentry from "@sentry/react-native";
import {
  useFonts,
  Urbanist_400Regular,
  Urbanist_500Medium,
  Urbanist_600SemiBold,
  Urbanist_700Bold
} from "@expo-google-fonts/urbanist";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { ReliabilityBanner } from "./src/components/ReliabilityBanner";
import { flushQueuedMutations, getQueuedMutationCount } from "./src/lib/mutation-queue";
import { applyUrbanistTextDefaults } from "./src/lib/urbanist-defaults";
import { useAppearanceStore } from "./src/store/appearance-store";
import { PointsRewardToast } from "./src/features/points/components/PointsRewardToast";
import { queryClient } from "./src/lib/query-client";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function App() {
  const [fontsLoaded, fontError] = useFonts({
    Urbanist_400Regular,
    Urbanist_500Medium,
    Urbanist_600SemiBold,
    Urbanist_700Bold
  });
  const [isOffline, setIsOffline] = useState(false);
  const [queuedMutations, setQueuedMutations] = useState(0);

  useEffect(() => {
    if (!fontsLoaded && !fontError) {
      return;
    }
    if (fontsLoaded) {
      applyUrbanistTextDefaults();
    }
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    void useAppearanceStore.getState().hydrate();
  }, []);

  useEffect(() => {
    let mounted = true;
    getQueuedMutationCount().then((count) => {
      if (mounted) {
        setQueuedMutations(count);
      }
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
      if (!offline) {
        flushQueuedMutations()
          .then(() => getQueuedMutationCount())
          .then((count) => {
            if (mounted) {
              setQueuedMutations(count);
            }
          })
          .catch(() => undefined);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ReliabilityBanner isOffline={isOffline} queuedMutations={queuedMutations} />
        <AppNavigator />
        <PointsRewardToast />
        <StatusBar style="dark" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
