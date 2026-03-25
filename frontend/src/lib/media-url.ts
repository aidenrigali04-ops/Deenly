const MEDIA_PUBLIC_BASE_URL = String(process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");

export function resolveMediaUrl(mediaUrl: string | null | undefined) {
  const raw = String(mediaUrl || "").trim();
  if (!raw) {
    return null;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  const keyLike = raw.replace(/^\/+/, "");
  if (!keyLike || !MEDIA_PUBLIC_BASE_URL) {
    return null;
  }
  return `${MEDIA_PUBLIC_BASE_URL}/${keyLike}`;
}
