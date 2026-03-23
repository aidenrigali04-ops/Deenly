import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

type ReliabilityBannerProps = {
  isOffline: boolean;
  queuedMutations: number;
};

export function ReliabilityBanner({ isOffline, queuedMutations }: ReliabilityBannerProps) {
  if (!isOffline && queuedMutations === 0) {
    return null;
  }

  return (
    <View style={[styles.banner, isOffline ? styles.offline : styles.queueing]}>
      <Text style={styles.text}>
        {isOffline
          ? "Offline mode: actions will sync when connected."
          : `Synced pending actions. Remaining queue: ${queuedMutations}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  offline: {
    backgroundColor: "#422326"
  },
  queueing: {
    backgroundColor: "#113322"
  },
  text: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center"
  }
});
