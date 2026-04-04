export const CREATOR_HUB_TABS = ["overview", "payouts", "products", "grow"] as const;
export type CreatorHubTab = (typeof CREATOR_HUB_TABS)[number];

export function parseCreatorHubTab(raw: string | null): CreatorHubTab {
  if (!raw || raw === "insights") {
    return "overview";
  }
  if (CREATOR_HUB_TABS.includes(raw as CreatorHubTab)) {
    return raw as CreatorHubTab;
  }
  return "overview";
}

export const CREATOR_HUB_TAB_LABELS: Record<CreatorHubTab, string> = {
  overview: "Overview",
  payouts: "Get paid",
  products: "Products",
  grow: "Grow"
};
