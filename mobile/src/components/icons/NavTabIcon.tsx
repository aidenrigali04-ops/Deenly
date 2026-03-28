import Svg, { Circle, Path, Rect } from "react-native-svg";

export type NavTabIconKind = "home" | "video" | "marketplace" | "send" | "search" | "upload" | "user";

type Props = {
  kind: NavTabIconKind;
  color: string;
  size?: number;
};

const SW = 1.8;

export function NavTabIcon({ kind, color, size = 24 }: Props) {
  const common = { stroke: color, strokeWidth: SW, fill: "none" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {kind === "home" ? (
        <>
          <Path d="M3 10.8L12 4l9 6.8" {...common} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M5.5 10.5V20h13V10.5" {...common} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {kind === "video" ? (
        <>
          <Rect x="3.5" y="6" width="11.5" height="12" rx="2" {...common} />
          <Path d="M15 10.5l5.5-2v7l-5.5-2z" {...common} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {kind === "marketplace" ? (
        <>
          <Path d="M4 10V8a2 2 0 0 1 2-2h2" {...common} strokeLinecap="round" />
          <Path d="M4 14v2a2 2 0 0 0 2 2h2" {...common} strokeLinecap="round" />
          <Path d="M20 10V8a2 2 0 0 0-2-2h-2" {...common} strokeLinecap="round" />
          <Path d="M20 14v2a2 2 0 0 1-2 2h-2" {...common} strokeLinecap="round" />
          <Path d="M8 6V4h8v2" {...common} strokeLinecap="round" />
          <Path d="M8 18v2h8v-2" {...common} strokeLinecap="round" />
          <Path d="M9 10h6v4H9z" {...common} strokeLinecap="round" />
        </>
      ) : null}
      {kind === "send" ? (
        <>
          <Path d="M21 3L10 14" {...common} strokeLinecap="round" />
          <Path d="M21 3l-7 18-4-7-7-4z" {...common} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {kind === "search" ? (
        <>
          <Circle cx="11" cy="11" r="6.5" {...common} />
          <Path d="M20 20l-4-4" {...common} strokeLinecap="round" />
        </>
      ) : null}
      {kind === "upload" ? (
        <>
          <Circle cx="12" cy="12" r="8" {...common} />
          <Path d="M12 8v8" {...common} strokeLinecap="round" />
          <Path d="M8 12h8" {...common} strokeLinecap="round" />
        </>
      ) : null}
      {kind === "user" ? (
        <>
          <Circle cx="12" cy="8" r="3.5" {...common} />
          <Path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...common} strokeLinecap="round" />
        </>
      ) : null}
    </Svg>
  );
}
