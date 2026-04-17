/**
 * Social shell icons from Figma “Social Media App UI”
 * (https://www.figma.com/design/ENiMwuzckx3GS38GvaU76W/Social-Media-App-UI).
 *
 * ## Workflow (best quality)
 *
 * 1. **Local (recommended for prod):** Export each layer as **SVG** (or @2x PNG) into
 *    `frontend/public/icons/social/` using the filenames in `LOCAL_ICON_FILE`.
 * 2. Set `NEXT_PUBLIC_SOCIAL_ICONS_MODE=local` in `.env.local` (see `.env.example`).
 * 3. Icons are served from your origin — no Figma CDN expiry, works offline, predictable caching.
 *
 * **Remote (default / quick dev):** Figma MCP asset URLs (`/api/mcp/asset/...`). These can
 * **expire or rotate**; refresh UUIDs via Figma MCP `get_design_context` on the same nodes
 * when images break.
 */
const FIGMA_ASSET = (id: string) => `https://www.figma.com/api/mcp/asset/${id}`;

const REMOTE = {
  /** Home tab — `1:211` */
  navHome: FIGMA_ASSET("cc2b95d1-122b-49b2-aa97-4f44a5e600e8"),
  /** Discover search — `1:277` */
  discoverSearch: FIGMA_ASSET("d33f7466-f293-4eef-8f2a-bec300122efa"),
  /** Profile Photo tab — `1:418` (market tile) */
  navMarket: FIGMA_ASSET("4082e056-3a5e-46d2-b7f9-34bd378a1823"),
  /** Profile Reels tab — `1:426` */
  navReels: FIGMA_ASSET("065bb2b7-7df1-4442-a7aa-8e347a942e3c"),
  /** Home header message — `1:201` */
  headerMessage: FIGMA_ASSET("c6ad04f2-b93d-4eac-a2ff-e59837961125"),
  /** Home header heart — `1:206` */
  headerHeart: FIGMA_ASSET("de40a048-34e1-492d-a900-666e395bd2c4"),
  /** Nav bell — `1:221` */
  navBell: FIGMA_ASSET("1469ebee-6c78-4991-9db2-3b5570040d2c"),
  /** Nav profile — `1:224` */
  navProfile: FIGMA_ASSET("7078153b-f4d4-4ce7-ac4e-1e42b8aa0201"),
  /** Feed like — `1:143` */
  feedLike: FIGMA_ASSET("8a0853a0-1ed2-4cec-92f3-be81a8a75a45"),
  /** Feed comment — `1:148` */
  feedComment: FIGMA_ASSET("a0e082ed-6cf2-4a22-9e04-d6e91ceea48c"),
  /** Feed save — `1:153` */
  feedSave: FIGMA_ASSET("078cee7f-8b90-470d-9ceb-c17a76b47090"),
  /** Post overflow — `1:137` */
  feedMore: FIGMA_ASSET("fb8b1d57-253c-4dcb-b0cd-2c68a566937c")
} as const;

export type SocialIconKey = keyof typeof REMOTE;

/** File names under `public/icons/social/` — must match keys in `REMOTE`. */
export const LOCAL_ICON_FILE: Record<SocialIconKey, string> = {
  navHome: "nav-home.svg",
  discoverSearch: "discover-search.svg",
  navMarket: "nav-market.svg",
  navReels: "nav-reels.svg",
  headerMessage: "header-message.svg",
  headerHeart: "header-heart.svg",
  navBell: "nav-bell.svg",
  navProfile: "nav-profile.svg",
  feedLike: "feed-like.svg",
  feedComment: "feed-comment.svg",
  feedSave: "feed-save.svg",
  feedMore: "feed-more.svg"
};

const PUBLIC_PREFIX = "/icons/social";

function isLocalIconMode(): boolean {
  return process.env.NEXT_PUBLIC_SOCIAL_ICONS_MODE === "local";
}

export function resolveSocialIconSrc(key: SocialIconKey): string {
  if (isLocalIconMode()) {
    return `${PUBLIC_PREFIX}/${LOCAL_ICON_FILE[key]}`;
  }
  return REMOTE[key];
}

/** Resolved once per server/client bundle — switch mode via env + rebuild dev server. */
function buildSocialIconMap(): typeof REMOTE {
  const entries = (Object.keys(REMOTE) as SocialIconKey[]).map((key) => [key, resolveSocialIconSrc(key)] as const);
  return Object.fromEntries(entries) as typeof REMOTE;
}

/**
 * Use these as `src` for {@link FigmaRasterIcon}.
 * In `local` mode, ensure files exist under `public/icons/social/`.
 */
export const figmaSocialIcons = buildSocialIconMap();
