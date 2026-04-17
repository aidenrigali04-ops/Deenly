import Image from "next/image";

type FigmaRasterIconProps = {
  src: string;
  className?: string;
  size?: 20 | 24 | 28;
};

const px: Record<NonNullable<FigmaRasterIconProps["size"]>, string> = {
  20: "h-5 w-5",
  24: "h-6 w-6",
  28: "h-7 w-7"
};

const isFigmaCdn = (src: string) => src.includes("figma.com/api/mcp/asset");

/**
 * Social / Figma-aligned icon: uses `next/image` for same-origin and Figma CDN (with `remotePatterns`).
 * Figma MCP URLs are loaded **unoptimized** to avoid optimizer churn on short-lived assets.
 */
export function FigmaRasterIcon({ src, className = "", size = 24 }: FigmaRasterIconProps) {
  const dim = px[size];
  const common = `pointer-events-none object-contain ${dim} ${className}`.trim();

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={common}
      sizes={`${size}px`}
      unoptimized={isFigmaCdn(src)}
    />
  );
}
