export const CREATOR_HUB_TABS = ["overview", "payouts", "products", "grow", "insights"] as const;
export type CreatorHubTab = (typeof CREATOR_HUB_TABS)[number];

export function parseCreatorHubTab(raw: string | null): CreatorHubTab {
  if (raw && CREATOR_HUB_TABS.includes(raw as CreatorHubTab)) {
    return raw as CreatorHubTab;
  }
  return "overview";
}

export const CREATOR_HUB_TAB_LABELS: Record<CreatorHubTab, string> = {
  overview: "Overview",
  payouts: "Payouts",
  products: "Products",
  grow: "Grow",
  insights: "Leaderboard"
};
