import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { figmaMobile, figmaMobileHome } from "../theme";
import { resolveMediaUrl } from "../lib/media-url";

const AVATAR = figmaMobileHome.headerAvatarSize;
const ICON_WELL = 48;

type Props = {
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  /** Unread hint for messages (optional) */
  showMessageDot?: boolean;
  onPressProfile: () => void;
  onPressMessages: () => void;
  onPressActivity: () => void;
};

export function HomeFeedHeader({
  displayName,
  username,
  avatarUrl,
  showMessageDot = false,
  onPressProfile,
  onPressMessages,
  onPressActivity
}: Props) {
  const insets = useSafeAreaInsets();
  const uri = resolveMediaUrl(avatarUrl) || undefined;
  const handle = username.startsWith("@") ? username : `@${username}`;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + figmaMobileHome.headerPadVTop }]} accessibilityRole="header">
      <View style={styles.row}>
        <Pressable
          onPress={onPressProfile}
          style={({ pressed }) => [styles.identity, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="My profile"
        >
          <View style={styles.avatar}>
            {uri ? (
              <Image source={{ uri }} style={styles.avatarImg} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarLetter}>{displayName.slice(0, 1).toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.handle} numberOfLines={1}>
              {handle}
            </Text>
          </View>
        </Pressable>

        <View style={styles.actions}>
          <Pressable
            onPress={onPressActivity}
            style={({ pressed }) => [styles.iconWell, pressed && styles.iconWellPressed]}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={22} color={figmaMobile.text} />
          </Pressable>
          <Pressable
            onPress={onPressMessages}
            style={({ pressed }) => [styles.iconWell, pressed && styles.iconWellPressed]}
            accessibilityRole="button"
            accessibilityLabel="Messages"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={figmaMobile.text} />
            {showMessageDot ? <View style={styles.dot} /> : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "transparent",
    paddingBottom: figmaMobileHome.headerPadVBottom
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: figmaMobileHome.pagePadH,
    gap: 10
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0
  },
  pressed: {
    opacity: 0.88
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: "#FFFFFF",
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 5, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 20
      },
      android: { elevation: 3 },
      default: {}
    })
  },
  avatarImg: {
    width: "100%",
    height: "100%"
  },
  avatarLetter: {
    fontSize: 20,
    fontWeight: "700",
    color: figmaMobile.avatarInitialInk
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  name: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    color: figmaMobile.text,
    letterSpacing: -0.35
  },
  handle: {
    fontSize: 12,
    fontWeight: "400",
    color: "rgba(255, 255, 255, 0.8)",
    lineHeight: 16,
    letterSpacing: -0.1
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  iconWell: {
    width: ICON_WELL,
    height: ICON_WELL,
    borderRadius: ICON_WELL / 2,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 8, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 28
      },
      android: { elevation: 2 },
      default: {}
    })
  },
  iconWellPressed: {
    opacity: 0.85
  },
  dot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: figmaMobile.accentGold,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: figmaMobile.canvas
  }
});
