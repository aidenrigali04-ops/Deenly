/**
 * Preset boost packages for promoted feed delivery. Amounts are suggestions until Stripe prepay gates funding.
 */
function listBoostPackages() {
  return [
    {
      id: "feed_spotlight_7d",
      label: "Feed spotlight (7 days)",
      description: "Suggested reach in the main For You feed; creative review before delivery.",
      durationDays: 7,
      suggestedBudgetMinor: 4900,
      dailyCapImpressions: 2000,
      currency: "usd"
    },
    {
      id: "opportunity_boost_14d",
      label: "Opportunities boost (14 days)",
      description: "For B2B-facing marketplace posts in the Opportunities tab.",
      durationDays: 14,
      suggestedBudgetMinor: 9900,
      dailyCapImpressions: 4000,
      currency: "usd"
    },
    {
      id: "event_highlight_7d",
      label: "Event highlight (7 days)",
      description: "Promote a public scheduled event to nearby interested users.",
      durationDays: 7,
      suggestedBudgetMinor: 6900,
      dailyCapImpressions: 1500,
      currency: "usd"
    }
  ];
}

function getBoostPackageById(packageId) {
  const id = String(packageId || "").trim();
  if (!id) {
    return null;
  }
  return listBoostPackages().find((p) => p.id === id) || null;
}

module.exports = {
  listBoostPackages,
  getBoostPackageById
};
