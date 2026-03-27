"use client";

import type { CreatorHubTab } from "./creator-hub-constants";
import { CREATOR_HUB_TABS, CREATOR_HUB_TAB_LABELS } from "./creator-hub-constants";

export function CreatorHubTabBar({
  activeTab,
  onTabChange,
  idPrefix = "creator-hub"
}: {
  activeTab: CreatorHubTab;
  onTabChange: (tab: CreatorHubTab) => void;
  idPrefix?: string;
}) {
  return (
    <div
      className="mb-6 flex flex-wrap gap-1 border-b border-black/10 pb-1"
      role="tablist"
      aria-label="Creator hub sections"
    >
      {CREATOR_HUB_TABS.map((tab) => {
        const selected = activeTab === tab;
        return (
          <button
            key={tab}
            id={`${idPrefix}-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`rounded-t-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
              selected ? "bg-surface text-text shadow-sm" : "text-muted hover:bg-black/[0.04] hover:text-text"
            }`}
            onClick={() => onTabChange(tab)}
          >
            {CREATOR_HUB_TAB_LABELS[tab]}
          </button>
        );
      })}
    </div>
  );
}
