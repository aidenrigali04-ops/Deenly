"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { CreatorHubTab } from "./creator-hub-constants";
import { CREATOR_HUB_TABS, CREATOR_HUB_TAB_LABELS } from "./creator-hub-constants";

export function CreatorHubTabBar({
  activeTab,
  onTabChange,
  idPrefix = "creator-hub",
  tabs = CREATOR_HUB_TABS
}: {
  activeTab: CreatorHubTab;
  onTabChange: (tab: CreatorHubTab) => void;
  idPrefix?: string;
  tabs?: readonly CreatorHubTab[];
}) {
  const tabRefs = useRef<Partial<Record<CreatorHubTab, HTMLButtonElement | null>>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    function updateIndicator() {
      const btn = tabRefs.current[activeTab];
      const list = listRef.current;
      if (!btn || !list) {
        return;
      }
      const listRect = list.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setIndicator({
        left: btnRect.left - listRect.left + list.scrollLeft,
        width: btnRect.width
      });
    }
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [activeTab]);

  return (
    <div className="mb-6">
      <div
        ref={listRef}
        className="relative flex flex-wrap gap-1 border-b border-black/10"
        role="tablist"
        aria-label="Creator hub sections"
      >
        <span
          className="creator-hub-tab-indicator pointer-events-none absolute bottom-0 z-0 h-0.5 rounded-full bg-black transition-[left,width] duration-200 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
          aria-hidden
        />
        {tabs.map((tab) => {
          const selected = activeTab === tab;
          return (
            <button
              key={tab}
              ref={(el) => {
                tabRefs.current[tab] = el;
              }}
              id={`${idPrefix}-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={`relative z-10 rounded-t-md px-3 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                selected ? "text-text" : "text-muted hover:bg-black/[0.04] hover:text-text"
              }`}
              onClick={() => onTabChange(tab)}
            >
              {CREATOR_HUB_TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
