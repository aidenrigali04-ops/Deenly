"use client";

import { FeedView } from "@/components/feed-view";

export default function MarketplacePage() {
  return (
    <FeedView
      heading="Marketplace"
      fixedFeedTab="marketplace"
      feedSubtitle="Promotions and creator offers for individuals and families (B2C)."
      homeStyle
    />
  );
}
