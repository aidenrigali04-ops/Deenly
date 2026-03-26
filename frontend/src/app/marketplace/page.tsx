"use client";

import { FeedView } from "@/components/feed-view";

export default function MarketplacePage() {
  return (
    <FeedView
      heading="Marketplace"
      fixedFeedTab="marketplace"
      feedSubtitle="Promotions and creator offers (all marketplace listings)."
      homeStyle
    />
  );
}
