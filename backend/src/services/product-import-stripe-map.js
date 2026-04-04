function normalizeCurrency(value) {
  return String(value || "usd")
    .trim()
    .toLowerCase()
    .slice(0, 3);
}

function readFirstMetadata(metadata, keys) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  for (const key of keys) {
    const raw = metadata[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    const value = String(raw).trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function normalizeAudienceTarget(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === "b2b" || value === "b2c" || value === "both") {
    return value;
  }
  return "both";
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
  const websiteUrl = (() => {
    const productUrl = String(product?.url || "").trim();
    if (/^https?:\/\//i.test(productUrl)) {
      return productUrl.slice(0, 2000);
    }
    const metaWebsite = readFirstMetadata(product?.metadata, ["websiteUrl", "website_url", "url", "link"]);
    if (metaWebsite && /^https?:\/\//i.test(metaWebsite)) {
      return metaWebsite.slice(0, 2000);
    }
    return null;
  })();
  const serviceDetails =
    readFirstMetadata(product?.metadata, ["serviceDetails", "service_details", "details", "service"])?.slice(0, 2000) ||
    null;
  const deliveryMethod =
    readFirstMetadata(product?.metadata, ["deliveryMethod", "delivery_method", "delivery"])?.slice(0, 120) || null;
  const businessCategory =
    readFirstMetadata(product?.metadata, ["businessCategory", "business_category", "category"])?.slice(0, 64) || null;
  const audienceTarget = normalizeAudienceTarget(
    readFirstMetadata(product?.metadata, ["audienceTarget", "audience_target"])
  );

  return {
    title,
    description,
    priceMinor: unitAmount,
    currency: normalizeCurrency(price?.currency),
    productType,
    websiteUrl,
    serviceDetails,
    deliveryMethod,
    audienceTarget,
    businessCategory
  };
}

module.exports = {
  mapStripeProductPriceToDraft,
  normalizeCurrency
};
