import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { colors, primaryButtonOutline, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "PlaidLink">;

function extractPublicToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  if (typeof o.public_token === "string") return o.public_token;
  if (o.metadata && typeof o.metadata === "object") {
    const m = o.metadata as Record<string, unknown>;
    if (m.status === "success" && typeof m.public_token === "string") return m.public_token;
  }
  if (o.event_name === "EXIT" && o.metadata && typeof o.metadata === "object") {
    const m = o.metadata as Record<string, unknown>;
    if (m.status === "success" && typeof m.public_token === "string") return m.public_token;
  }
  if (o.action === "plaid_link_event" && o.metadata && typeof o.metadata === "object") {
    const m = o.metadata as Record<string, unknown>;
    if (m.status === "success" && typeof m.public_token === "string") return m.public_token;
  }
  return null;
}

export function PlaidLinkScreen({ navigation }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"boot" | "ready" | "exchanging">("boot");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiRequest<{ linkToken: string }>("/monetization/plaid/link-token", {
          method: "POST",
          auth: true,
          body: {}
        });
        if (!cancelled) {
          setLinkToken(r.linkToken);
          setPhase("ready");
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Plaid is not available.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      const pub = extractPublicToken(payload);
      if (!pub) return;
      setPhase("exchanging");
      try {
        const ex = await apiRequest<{ accounts: { id: string }[] }>("/monetization/plaid/exchange", {
          method: "POST",
          auth: true,
          body: { publicToken: pub }
        });
        const id = ex.accounts?.[0]?.id;
        if (id) {
          await apiRequest("/monetization/plaid/attach-stripe-payout", {
            method: "POST",
            auth: true,
            body: { accountId: id }
          });
        }
        navigation.goBack();
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not link bank.");
      } finally {
        setPhase("ready");
      }
    },
    [navigation]
  );

  if (loadError && !linkToken) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError}</Text>
        <Pressable style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!linkToken) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Preparing Plaid…</Text>
      </View>
    );
  }

  const uri = `https://cdn.plaid.com/link/v2/stable/link.html?isWebView=true&token=${encodeURIComponent(linkToken)}`;

  return (
    <View style={styles.flex}>
      {phase === "exchanging" ? (
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.overlayText}>Finishing bank link…</Text>
        </View>
      ) : null}
      {loadError ? <Text style={styles.banner}>{loadError}</Text> : null}
      <WebView
        source={{ uri }}
        onMessage={handleMessage}
        originWhitelist={["https://*", "http://*"]}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  muted: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, textAlign: "center", fontSize: 14 },
  banner: {
    backgroundColor: colors.subtleFill,
    padding: 10,
    color: colors.danger,
    fontSize: 13,
    textAlign: "center"
  },
  btn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radii.control,
    ...primaryButtonOutline
  },
  btnText: { color: colors.accent, fontWeight: "700" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    gap: 12
  },
  overlayText: { color: "#fff", fontSize: 15, fontWeight: "600" }
});
