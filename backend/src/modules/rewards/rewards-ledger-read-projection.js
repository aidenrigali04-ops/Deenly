/**
 * Buyer-facing projection from immutable ledger rows → stable i18n keys + structured source hints.
 * Pure functions; safe to unit test without DB.
 */

const LEDGER_UI_VARIANT = new Set(["earn", "spend", "reversal"]);

const EARN_TITLE_KEYS = {
  signup_complete: "rewards.ledger.earn.signup_complete",
  first_post_published: "rewards.ledger.earn.first_post_published",
  first_post: "rewards.ledger.earn.first_post",
  qualified_engagement: "rewards.ledger.earn.qualified_engagement",
  referral_qualified: "rewards.ledger.earn.referral_qualified",
  purchase_completed: "rewards.ledger.earn.purchase_completed",
  first_product_order_completed: "rewards.ledger.earn.first_product_order_completed",
  daily_active_streak: "rewards.ledger.earn.daily_active_streak",
  admin_grant: "rewards.ledger.earn.admin_grant"
};

const SPEND_TITLE_KEYS = {
  redemption_catalog: "rewards.ledger.spend.redemption_catalog",
  admin_adjustment: "rewards.ledger.spend.admin_adjustment",
  expiration: "rewards.ledger.spend.expiration"
};

function uiVariant(entryKind) {
  const k = String(entryKind || "");
  return LEDGER_UI_VARIANT.has(k) ? k : "earn";
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function inferReferralSubtitleKey(idempotencyKey) {
  const s = String(idempotencyKey || "");
  if (s.includes(":referee:") || s.includes("referral:qualified:referee:")) {
    return "rewards.ledger.earn.referral_qualified.subtitle_referee";
  }
  if (s.includes(":referrer:") || s.includes("referral:qualified:referrer:")) {
    return "rewards.ledger.earn.referral_qualified.subtitle_referrer";
  }
  return undefined;
}

/**
 * @param {object} metadata
 * @param {string} entryKind
 * @param {string} reason
 * @param {string} idempotencyKey
 * @returns {{ kind: string, orderId?: number, attributionId?: number, productId?: number, postId?: number, commentId?: number, orderKind?: string } | null}
 */
function buildSourceDto(metadata, entryKind, reason) {
  const m = metadata && typeof metadata === "object" ? metadata : {};
  const orderId = numOrNull(m.orderId);
  const attributionId = numOrNull(m.attributionId);
  const productId = numOrNull(m.productId);
  const postId = numOrNull(m.targetPostId ?? m.postId);
  const commentId = numOrNull(m.commentId);
  const orderKind = m.orderKind != null ? String(m.orderKind) : undefined;

  if (entryKind === "spend" && String(reason) === "redemption_catalog") {
    return {
      kind: "checkout",
      productId: productId ?? undefined,
      orderId: orderId ?? undefined
    };
  }

  if (attributionId != null && String(reason) === "referral_qualified") {
    return {
      kind: "attribution",
      attributionId,
      orderId: orderId ?? undefined
    };
  }

  if (orderId != null) {
    return {
      kind: "order",
      orderId,
      orderKind
    };
  }

  if (postId != null || commentId != null) {
    return {
      kind: postId != null ? "post" : "comment",
      postId: postId ?? undefined,
      commentId: commentId ?? undefined
    };
  }

  return null;
}

/**
 * @param {{ entryKind: string, reason: string, metadata: object, idempotencyKey: string, deltaPoints: string }} row — normalized ledger row (camelCase)
 */
function buildDisplayDto(row) {
  const entryKind = String(row.entryKind || "");
  const reason = String(row.reason || "").trim() || "_unknown";
  const variant = uiVariant(entryKind);
  const idem = String(row.idempotencyKey || "");

  let titleKey;
  if (variant === "earn") {
    titleKey = EARN_TITLE_KEYS[reason] || "rewards.ledger.earn._unknown";
  } else if (variant === "spend") {
    titleKey = SPEND_TITLE_KEYS[reason] || "rewards.ledger.spend._unknown";
  } else {
    titleKey = "rewards.ledger.reversal._default";
  }

  /** @type {string | undefined} */
  let subtitleKey;
  if (variant === "earn" && reason === "referral_qualified") {
    subtitleKey = inferReferralSubtitleKey(idem);
  }

  /** @type {string | undefined} */
  let iconKey;
  if (variant === "earn") {
    iconKey = "plus_circle";
  } else if (variant === "spend") {
    iconKey = "minus_circle";
  } else {
    iconKey = "arrow_uturn";
  }

  return {
    variant,
    titleKey,
    subtitleKey,
    iconKey
  };
}

/**
 * @param {{ entryKind: string, reason: string, reversesLedgerEntryId: number | null }} row
 */
function buildReversalOfDto(row) {
  if (String(row.entryKind) !== "reversal") {
    return null;
  }
  const orig = row.reversesLedgerEntryId;
  if (orig == null) {
    return null;
  }
  const n = Number(orig);
  if (!Number.isInteger(n) || n < 1) {
    return null;
  }
  return { originalLedgerEntryId: n };
}

/**
 * @param {{ entryKind: string, reason: string, metadata: object }} row
 */
function buildRedemptionDto(row) {
  if (String(row.entryKind) !== "spend" || String(row.reason) !== "redemption_catalog") {
    return null;
  }
  const m = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const surface = m.surface != null ? String(m.surface) : undefined;
  const productId = numOrNull(m.productId) ?? undefined;
  const redeemClientRequestId = m.redeemClientRequestId != null ? String(m.redeemClientRequestId) : undefined;
  const discountMinor = numOrNull(m.discountMinor) ?? undefined;
  const listPriceMinor = numOrNull(m.listPriceMinor) ?? undefined;
  return {
    surface: surface || undefined,
    productId,
    redeemClientRequestId,
    discountMinor,
    listPriceMinor
  };
}

/**
 * @param {{ entryKind: string, reason: string, metadata: object, idempotencyKey: string, deltaPoints: string, reversesLedgerEntryId: number | null }} row
 */
function buildLedgerReadProjection(row) {
  const reason = String(row.reason || "").trim();
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const resolved =
    metadata.resolvedEarnAction != null && String(metadata.resolvedEarnAction).trim() !== ""
      ? String(metadata.resolvedEarnAction).trim()
      : null;

  const ledgerReasonKey = reason.length > 0 ? reason : "_unknown";

  return {
    ledgerReasonKey,
    resolvedEarnAction: resolved,
    source: buildSourceDto(metadata, String(row.entryKind), reason),
    display: buildDisplayDto(row),
    reversalOf: buildReversalOfDto(row),
    redemption: buildRedemptionDto(row)
  };
}

function buildWalletDisplayDto() {
  return {
    balanceTitleKey: "rewards.wallet.balance_title",
    ledgerSectionTitleKey: "rewards.wallet.ledger_section_title",
    historyHintKey: "rewards.wallet.history_hint"
  };
}

module.exports = {
  buildLedgerReadProjection,
  buildWalletDisplayDto,
  uiVariant,
  buildSourceDto,
  buildDisplayDto
};
