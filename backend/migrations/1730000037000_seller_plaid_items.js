/* eslint-disable camelcase */

/**
 * Plaid-linked bank tokens for seller payouts (Stripe Connect external account).
 * Timestamp is after 1730000036000 so deploys that already ran persona/events migrations
 * do not hit an out-of-order migration error.
 */

exports.shorthands = undefined;

exports.up = async (pgm) => {
  const { rows } = await pgm.db.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'seller_plaid_items'
    ) AS exists
  `);
  if (rows[0]?.exists) {
    return;
  }
  pgm.createTable("seller_plaid_items", {
    user_id: {
      type: "integer",
      primaryKey: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    item_id: { type: "varchar(64)", notNull: true },
    access_token_enc: { type: "text", notNull: true },
    institution_name: { type: "varchar(256)" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
};

exports.down = (pgm) => {
  pgm.dropTable("seller_plaid_items", { ifExists: true });
};
