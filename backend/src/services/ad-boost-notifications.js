const { createNotification } = require("./notifications");

function parseAdBoostLiveDedupeMinutes() {
  const n = Number(process.env.AD_BOOST_LIVE_NOTIFY_DEDUPE_MINUTES);
  if (Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 60) {
    return n;
  }
  return 3;
}

/**
 * Avoid duplicate "live" toasts when approve and payment webhooks land close together.
 */
async function hasRecentAdBoostLiveForCampaign(db, userId, campaignId, windowMinutes) {
  if (!windowMinutes || windowMinutes <= 0 || !userId || !campaignId) {
    return false;
  }
  const r = await db.query(
    `SELECT 1 FROM notifications
     WHERE user_id = $1
       AND type = 'ad_boost_live'
       AND (payload->>'campaignId')::int = $2
       AND created_at > NOW() - ($3::int * INTERVAL '1 minute')
     LIMIT 1`,
    [userId, campaignId, windowMinutes]
  );
  return r.rowCount > 0;
}

async function notifyAdBoostLiveDeduped(db, pushNotifications, userId, campaignId, payload) {
  const windowMinutes = parseAdBoostLiveDedupeMinutes();
  if (await hasRecentAdBoostLiveForCampaign(db, userId, campaignId, windowMinutes)) {
    return;
  }
  const opts = pushNotifications ? { pushNotifications } : {};
  await createNotification(db, userId, "ad_boost_live", payload, opts);
}

/**
 * After moderator approves creative (review queue or moderation action), notify the advertiser.
 */
async function notifyAfterCreativeApproval(db, pushNotifications, campaignId) {
  const opts = pushNotifications ? { pushNotifications } : {};
  const r = await db.query(
    `SELECT id, creator_user_id, status FROM ad_campaigns WHERE id = $1 LIMIT 1`,
    [campaignId]
  );
  if (r.rowCount === 0) {
    return;
  }
  const c = r.rows[0];
  if (c.status === "active") {
    await notifyAdBoostLiveDeduped(db, pushNotifications, c.creator_user_id, c.id, {
      campaignId: c.id,
      title: "Boost is live",
      message: "Your feed boost is approved and delivering."
    });
    return;
  }
  await createNotification(
    db,
    c.creator_user_id,
    "ad_boost_approve_pay",
    {
      campaignId: c.id,
      title: "Boost creative approved",
      message: "Complete payment in Creator hub → Grow to start delivery."
    },
    opts
  );
}

async function notifyAdBoostRejected(db, pushNotifications, campaignId, notePreview) {
  const opts = pushNotifications ? { pushNotifications } : {};
  const r = await db.query(
    `SELECT creator_user_id FROM ad_campaigns WHERE id = $1 LIMIT 1`,
    [campaignId]
  );
  if (r.rowCount === 0) {
    return;
  }
  const preview = String(notePreview || "").trim().slice(0, 200);
  await createNotification(
    db,
    r.rows[0].creator_user_id,
    "ad_boost_rejected",
    {
      campaignId,
      notePreview: preview || undefined,
      title: "Boost not approved",
      message: preview ? `Moderator note: ${preview}` : "Your boost creative was not approved."
    },
    opts
  );
}

/**
 * After Stripe confirms ad_boost checkout (budget funded).
 */
async function notifyAfterAdBoostPayment(db, pushNotifications, campaignId) {
  const opts = pushNotifications ? { pushNotifications } : {};
  const r = await db.query(
    `SELECT id, creator_user_id, status FROM ad_campaigns WHERE id = $1 LIMIT 1`,
    [campaignId]
  );
  if (r.rowCount === 0) {
    return;
  }
  const c = r.rows[0];
  if (c.status === "active") {
    await notifyAdBoostLiveDeduped(db, pushNotifications, c.creator_user_id, c.id, {
      campaignId: c.id,
      title: "Boost is live",
      message: "Payment received—your boost is approved and delivering."
    });
    return;
  }
  await createNotification(
    db,
    c.creator_user_id,
    "ad_boost_payment_received",
    {
      campaignId: c.id,
      title: "Boost payment received",
      message: "We recorded your payment. Delivery starts once creative review approves."
    },
    opts
  );
}

module.exports = {
  notifyAfterCreativeApproval,
  notifyAdBoostRejected,
  notifyAfterAdBoostPayment,
  hasRecentAdBoostLiveForCampaign,
  parseAdBoostLiveDedupeMinutes
};
