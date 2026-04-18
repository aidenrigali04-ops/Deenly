import { useMemo } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveFigmaMobileHome } from "../theme";
import { useAppChrome } from "../lib/use-app-chrome";
import { resolveMediaUrl } from "../lib/media-url";

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
  /** Opens Discover search (people, posts). */
  onPressSearch?: () => void;
};

function buildLayoutStyles(fh: ReturnType<typeof resolveFigmaMobileHome>) {
  const avatar = fh.headerAvatarSize;
  return StyleSheet.create({
    wrap: {
      backgroundColor: "transparent",
      paddingBottom: fh.headerPadVBottom
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: fh.pagePadH,
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
      width: avatar,
      height: avatar,
      borderRadius: avatar / 2,
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
      fontWeight: "700"
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
      letterSpacing: -0.35
    },
    handle: {
      fontSize: 12,
      fontWeight: "400",
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
      borderWidth: StyleSheet.hairlineWidth,
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
      borderWidth: StyleSheet.hairlineWidth * 2
    }
  });
}

export function HomeFeedHeader({
  displayName,
  username,
  avatarUrl,
  showMessageDot = false,
  onPressProfile,
  onPressMessages,
  onPressActivity,
  onPressSearch
}: Props) {
  const { figma: fm, figmaHome: fh } = useAppChrome();
  const layout = useMemo(() => buildLayoutStyles(fh), [fh]);
  const insets = useSafeAreaInsets();
  const uri = resolveMediaUrl(avatarUrl) || undefined;
  const handle = username.startsWith("@") ? username : `@${username}`;

  return (
    <View style={[layout.wrap, { paddingTop: insets.top + fh.headerPadVTop }]} accessibilityRole="header">
      <View style={layout.row}>
        <Pressable
          onPress={onPressProfile}
          style={({ pressed }) => [layout.identity, pressed && layout.pressed]}
          accessibilityRole="button"
          accessibilityLabel="My profile"
        >
          <View style={layout.avatar}>
            {uri ? (
              <Image source={{ uri }} style={layout.avatarImg} resizeMode="cover" />
            ) : (
              <Text style={[layout.avatarLetter, { color: fm.avatarInitialInk }]}>
                {displayName.slice(0, 1).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={layout.identityText}>
            <Text style={[layout.name, { color: fm.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[layout.handle, { color: fm.textMuted }]} numberOfLines={1}>
              {handle}
            </Text>
          </View>
        </Pressable>

        <View style={layout.actions}>
          {onPressSearch ? (
            <Pressable
              onPress={onPressSearch}
              style={({ pressed }) => [
                layout.iconWell,
                { backgroundColor: fm.glassSoft, borderColor: fm.glassBorderSoft },
                pressed && layout.iconWellPressed
              ]}
              accessibilityRole="button"
              accessibilityLabel="Search people and posts"
            >
              <Ionicons name="search-outline" size={22} color={fm.text} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onPressActivity}
            style={({ pressed }) => [
              layout.iconWell,
              { backgroundColor: fm.glassSoft, borderColor: fm.glassBorderSoft },
              pressed && layout.iconWellPressed
            ]}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={22} color={fm.text} />
          </Pressable>
          <Pressable
            onPress={onPressMessages}
            style={({ pressed }) => [
              layout.iconWell,
              { backgroundColor: fm.glassSoft, borderColor: fm.glassBorderSoft },
              pressed && layout.iconWellPressed
            ]}
            accessibilityRole="button"
            accessibilityLabel="Messages"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={fm.text} />
            {showMessageDot ? (
              <View style={[layout.dot, { backgroundColor: fm.accentGold, borderColor: fm.canvas }]} />
            ) : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
