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
      <Text style={[styles.text, isOffline ? styles.textOffline : styles.textQueueing]}>
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
    backgroundColor: "#fef2f2",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(220, 38, 38, 0.25)"
  },
  queueing: {
    backgroundColor: "#ecfdf5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(22, 163, 74, 0.2)"
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center"
  },
  textOffline: {
    color: colors.danger
  },
  textQueueing: {
    color: colors.success
  }
});
