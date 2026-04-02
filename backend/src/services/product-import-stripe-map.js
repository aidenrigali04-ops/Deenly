function normalizeCurrency(value) {
  return String(value || "usd")
    .trim()
    .toLowerCase()
    .slice(0, 3);
}

/**
 * Map Stripe Product + Price (from Connect account) to a Deenly product draft.
 * @param {object} product — Stripe Product
 * @param {object} price — Stripe Price
 */
function mapStripeProductPriceToDraft(product, price) {
  const name = String(product?.name || "").trim() || "Imported product";
  const title = name.slice(0, 180);
  const descRaw = product?.description != null ? String(product.description).trim() : "";
  const description = descRaw ? descRaw.slice(0, 2000) : null;

  const unitAmount = Number(price?.unit_amount);
  if (!Number.isInteger(unitAmount) || unitAmount <= 0) {
    throw new Error("Stripe price has no positive unit_amount (usage/metered prices are not supported)");
  }

  const recurring = price?.recurring;
  const productType = recurring ? "subscription" : "service";

  return {
    title,
    description,
    priceMinor: unitAmount,
    currency: normalizeCurrency(price?.currency),
    productType,
    websiteUrl: null
  };
}

module.exports = {
  mapStripeProductPriceToDraft,
  normalizeCurrency
};
