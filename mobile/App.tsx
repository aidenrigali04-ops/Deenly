import "react-native-gesture-handler";
import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { ReliabilityBanner } from "./src/components/ReliabilityBanner";
import { flushQueuedMutations, getQueuedMutationCount } from "./src/lib/mutation-queue";

const queryClient = new QueryClient();

export default function App() {
  const [isOffline, setIsOffline] = useState(false);
  const [queuedMutations, setQueuedMutations] = useState(0);

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

  return (
    <QueryClientProvider client={queryClient}>
      <ReliabilityBanner isOffline={isOffline} queuedMutations={queuedMutations} />
      <AppNavigator />
      <StatusBar style="light" />
    </QueryClientProvider>
  );
}
