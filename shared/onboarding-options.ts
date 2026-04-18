/**
 * Shared labels/keys for feed setup (Next.js). Mobile uses a mirror:
 * `mobile/src/lib/onboarding-options.ts` — update both when changing copy.
 */

export type InterestKey = "post" | "marketplace" | "reel";

export const INTEREST_OPTIONS: { key: InterestKey; label: string }[] = [
  { key: "post", label: "Posts & reminders" },
  { key: "marketplace", label: "Marketplace & offers" },
  { key: "reel", label: "Reels" }
];

export type IntentKey = "community" | "shop" | "sell" | "b2b";

export const INTENT_OPTIONS: { key: IntentKey; label: string }[] = [
  { key: "community", label: "Community & reflection" },
  { key: "shop", label: "Shop marketplace offers" },
  { key: "sell", label: "Sell or promote as a creator" },
  { key: "b2b", label: "Discover B2B-style opportunities" }
];

export type FeedTabKey = "for_you" | "marketplace";

export const FEED_TAB_OPTIONS: { key: FeedTabKey; label: string }[] = [
  { key: "for_you", label: "For You" },
  { key: "marketplace", label: "Marketplace" }
];

export type AppLandingKey = "home" | "marketplace";

export const APP_LANDING_OPTIONS: { key: AppLandingKey; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "marketplace", label: "Marketplace feed" }
];

export type UsagePersonaKey = "personal" | "professional" | "business";

export const USAGE_PERSONA_OPTIONS: {
  key: UsagePersonaKey;
  label: string;
  subtitle: string;
}[] = [
  {
    key: "personal",
    label: "Personal",
    subtitle: "Stay connected with community, reflections, and offers that match your interests."
  },
  {
    key: "professional",
    label: "Professional",
    subtitle: "Build credibility for your expertise and discover opportunities with more relevance."
  },
  {
    key: "business",
    label: "Business",
    subtitle: "Grow with creator tools, products, and payouts when you are ready to sell."
  }
];
