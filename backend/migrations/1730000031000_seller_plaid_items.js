/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
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
