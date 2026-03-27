import { useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import type { VideoContentFit } from "expo-video";

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: VideoContentFit;
  nativeControls?: boolean;
  loop?: boolean;
  play?: boolean;
  muted?: boolean;
  onError?: () => void;
};

export function AppVideoView({
  uri,
  style,
  contentFit = "contain",
  nativeControls = false,
  loop = false,
  play = true,
  muted = false,
  onError
}: Props) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
  });

  useEffect(() => {
    player.loop = loop;
    player.muted = muted;
  }, [loop, muted, player]);

  useEffect(() => {
    if (play) {
      player.play();
    } else {
      player.pause();
    }
  }, [play, player]);

  useEventListener(player, "statusChange", ({ status }) => {
    if (status === "error") {
      onError?.();
    }
  });

  return (
    <VideoView
      player={player}
      style={style}
      contentFit={contentFit}
      nativeControls={nativeControls}
    />
  );
}
