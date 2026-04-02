const { URLSearchParams } = require("url");
const { generateRawToken, hashToken } = require("./purchase-access-token");

function parseSmsOptIn(meta) {
  if (!meta || typeof meta !== "object") {
    return false;
  }
  const v = meta.smsOptIn;
  return v === true || v === "true";
}

function buildMagicAccessUrl(appBaseUrl, rawToken) {
  const base = String(appBaseUrl || "").replace(/\/+$/, "");
  if (!base) {
    return "";
  }
  return `${base}/purchase/access?token=${encodeURIComponent(rawToken)}`;
}

async function sendSendgridEmail({ apiKey, fromEmail, toEmail, subject, text }) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: fromEmail },
      subject,
      content: [{ type: "text/plain", value: text }]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`SendGrid HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }
}

async function sendTwilioSms({ accountSid, authToken, fromNumber, toPhone, body }) {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      To: toPhone,
      From: fromNumber,
      Body: body
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Twilio HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }
}

/**
 * Mint access token and send email / optional SMS. Idempotent per order (one active token).
 */
async function fulfillProductOrderAfterPayment({ db, config, logger, orderId, customerEmail, customerPhone, productTitle, smsOptIn }) {
  const existing = await db.query(
    `SELECT id FROM purchase_access_tokens
     WHERE order_id = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [orderId]
  );
  if (existing.rowCount > 0) {
    if (logger) {
      logger.info({ orderId }, "purchase_fulfillment_skip_existing_token");
    }
    return { skipped: true };
  }

  const ttlDays = Number(config.purchaseAccessTokenTtlDays) || 14;
  const raw = generateRawToken();
  const tokenHash = hashToken(raw);

  await db.query(
    `INSERT INTO purchase_access_tokens (order_id, token_hash, expires_at, max_uses, use_count)
     VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 day'), 25, 0)`,
    [orderId, tokenHash, ttlDays]
  );

  const magicUrl = buildMagicAccessUrl(config.appBaseUrl, raw);
  const safeTitle = String(productTitle || "Your purchase").slice(0, 180);

  const emailBody =
    `Thank you for your purchase on Deenly.\n\n` +
    `Product: ${safeTitle}\n\n` +
    `Open this link to access your purchase (check spam if you do not see this email):\n${magicUrl}\n\n` +
    `This link expires in ${ttlDays} days. If you need help, reply to support from the app.\n`;

  const smsBody = `Deenly: Your purchase "${safeTitle}" is ready. Open: ${magicUrl}`;

  let emailOk = false;
  let smsOk = false;

  if (
    logger &&
    !customerEmail &&
    !(smsOptIn && customerPhone && config.twilioAccountSid)
  ) {
    logger.warn({ orderId }, "purchase_fulfillment_no_email_or_sms_recipient");
  }

  if (customerEmail && config.fulfillmentEmailEnabled !== false && config.sendgridApiKey && config.sendgridFromEmail) {
    try {
      await sendSendgridEmail({
        apiKey: config.sendgridApiKey,
        fromEmail: config.sendgridFromEmail,
        toEmail: customerEmail,
        subject: `Your Deenly purchase: ${safeTitle}`,
        text: emailBody
      });
      emailOk = true;
      await db.query(
        `INSERT INTO fulfillment_outbox (order_id, channel, payload, status, attempts)
         VALUES ($1, 'email', $2::jsonb, 'sent', 1)`,
        [orderId, JSON.stringify({ toDomain: customerEmail.split("@")[1] || "unknown" })]
      );
    } catch (err) {
      if (logger) {
        logger.error({ err, orderId }, "purchase_fulfillment_email_failed");
      }
      await db.query(
        `INSERT INTO fulfillment_outbox (order_id, channel, payload, status, attempts, last_error)
         VALUES ($1, 'email', '{}'::jsonb, 'failed', 1, $2)`,
        [orderId, String(err.message || err).slice(0, 2000)]
      );
    }
  } else if (customerEmail && logger) {
    logger.warn({ orderId }, "purchase_fulfillment_email_skipped_missing_config");
  }

  if (
    smsOptIn &&
    customerPhone &&
    config.fulfillmentSmsEnabled !== false &&
    config.twilioAccountSid &&
    config.twilioAuthToken &&
    config.twilioFromNumber
  ) {
    try {
      await sendTwilioSms({
        accountSid: config.twilioAccountSid,
        authToken: config.twilioAuthToken,
        fromNumber: config.twilioFromNumber,
        toPhone: customerPhone,
        body: smsBody.slice(0, 1500)
      });
      smsOk = true;
      await db.query(
        `INSERT INTO fulfillment_outbox (order_id, channel, payload, status, attempts)
         VALUES ($1, 'sms', $2::jsonb, 'sent', 1)`,
        [orderId, JSON.stringify({ ok: true })]
      );
    } catch (err) {
      if (logger) {
        logger.error({ err, orderId }, "purchase_fulfillment_sms_failed");
      }
      await db.query(
        `INSERT INTO fulfillment_outbox (order_id, channel, payload, status, attempts, last_error)
         VALUES ($1, 'sms', '{}'::jsonb, 'failed', 1, $2)`,
        [orderId, String(err.message || err).slice(0, 2000)]
      );
    }
  }

  return { emailOk, smsOk, magicUrl };
}

module.exports = {
  parseSmsOptIn,
  buildMagicAccessUrl,
  fulfillProductOrderAfterPayment,
  sendSendgridEmail,
  sendTwilioSms
};
