const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require("plaid");
const { httpError } = require("../utils/http-error");
const { encryptPlaidSecret, decryptPlaidSecret } = require("../utils/plaid-token-crypto");

/**
 * Plaid Link + processor token for attaching a US bank account to the seller's Stripe Connect account.
 * Returns null when PLAID_CLIENT_ID / PLAID_SECRET are unset.
 */
function createPlaidSellerBankService({ db, config, logger }) {
  const clientId = String(config.plaidClientId || "").trim();
  const secret = String(config.plaidSecret || "").trim();
  const envName = String(config.plaidEnv || "sandbox").trim().toLowerCase();
  const log = logger || { info: () => {}, error: () => {}, warn: () => {} };

  if (!clientId || !secret) {
    return null;
  }

  const basePath = PlaidEnvironments[envName] || PlaidEnvironments.sandbox;
  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret
      }
    }
  });
  const client = new PlaidApi(configuration);

  async function createLinkToken(userId) {
    const resp = await client.linkTokenCreate({
      user: { client_user_id: String(userId) },
      client_name: "Deenly",
      products: [Products.Auth],
      country_codes: [CountryCode.Us],
      language: "en"
    });
    const linkToken = resp.data?.link_token;
    if (!linkToken) {
      throw httpError(502, "Plaid did not return a link token");
    }
    return { linkToken };
  }

  async function exchangePublicToken(userId, publicToken) {
    const ex = await client.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = ex.data?.access_token;
    const itemId = ex.data?.item_id;
    if (!accessToken || !itemId) {
      throw httpError(502, "Plaid token exchange failed");
    }
    const enc = encryptPlaidSecret(accessToken, config);
    await db.query(
      `INSERT INTO seller_plaid_items (user_id, item_id, access_token_enc, institution_name, updated_at)
       VALUES ($1, $2, $3, NULL, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         item_id = EXCLUDED.item_id,
         access_token_enc = EXCLUDED.access_token_enc,
         updated_at = NOW()`,
      [userId, itemId, enc]
    );

    const accountsResp = await client.accountsGet({ access_token: accessToken });
    const institutionName = accountsResp.data?.item?.institution_name || null;
    if (institutionName) {
      await db.query(`UPDATE seller_plaid_items SET institution_name = $2, updated_at = NOW() WHERE user_id = $1`, [
        userId,
        institutionName
      ]);
    }

    const accounts = (accountsResp.data?.accounts || []).map((a) => ({
      id: a.account_id,
      mask: a.mask || null,
      name: a.name || null,
      subtype: a.subtype || null,
      type: a.type || null
    }));

    return { itemId, institutionName, accounts };
  }

  async function getDecryptedAccessToken(userId) {
    const r = await db.query(`SELECT access_token_enc FROM seller_plaid_items WHERE user_id = $1 LIMIT 1`, [userId]);
    if (!r.rowCount) {
      return null;
    }
    try {
      return decryptPlaidSecret(r.rows[0].access_token_enc, config);
    } catch (e) {
      log.error({ err: e, userId }, "plaid_token_decrypt_failed");
      throw httpError(500, "Stored bank link is invalid; reconnect Plaid.");
    }
  }

  async function getStatus(userId) {
    const r = await db.query(
      `SELECT item_id, institution_name, created_at, updated_at FROM seller_plaid_items WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!r.rowCount) {
      return { linked: false };
    }
    const row = r.rows[0];
    return {
      linked: true,
      itemId: row.item_id,
      institutionName: row.institution_name,
      updatedAt: row.updated_at
    };
  }

  async function attachStripeBankAccount({ userId, plaidAccountId, monetizationGateway }) {
    const accessToken = await getDecryptedAccessToken(userId);
    if (!accessToken) {
      throw httpError(400, "Link your bank with Plaid first.");
    }
    const acct = await db.query(
      `SELECT stripe_account_id FROM creator_payout_accounts WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!acct.rowCount) {
      throw httpError(400, "Create your payout profile (Stripe) before attaching a bank account.");
    }
    const connectedAccountId = acct.rows[0].stripe_account_id;
    const proc = await client.processorStripeBankAccountTokenCreate({
      access_token: accessToken,
      account_id: String(plaidAccountId).trim()
    });
    const stripeBankAccountToken = proc.data?.stripe_bank_account_token;
    if (!stripeBankAccountToken) {
      throw httpError(502, "Plaid did not return a Stripe bank token");
    }
    if (typeof monetizationGateway.attachExternalBankToken !== "function") {
      throw httpError(503, "Payout attachment is not available");
    }
    const external = await monetizationGateway.attachExternalBankToken({
      connectedAccountId,
      stripeBankAccountToken
    });
    log.info({ userId, connectedAccountId, externalId: external?.id }, "plaid_stripe_external_account_attached");
    return {
      attached: true,
      stripeExternalAccountId: external?.id || null,
      bankName: external?.bank_name || null,
      last4: external?.last4 || null
    };
  }

  return {
    createLinkToken,
    exchangePublicToken,
    getStatus,
    attachStripeBankAccount
  };
}

module.exports = {
  createPlaidSellerBankService
};
