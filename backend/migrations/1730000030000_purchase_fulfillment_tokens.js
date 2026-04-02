/** @param {import("node-pg-migrate").MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE purchase_access_tokens (
      id serial PRIMARY KEY,
      order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      token_hash varchar(128) NOT NULL,
      expires_at timestamptz NOT NULL,
      max_uses integer NOT NULL DEFAULT 25,
      use_count integer NOT NULL DEFAULT 0,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT current_timestamp
    );
  `);
  pgm.createIndex("purchase_access_tokens", ["order_id"]);
  pgm.createIndex("purchase_access_tokens", ["token_hash"], { unique: true });
  pgm.sql(`
    CREATE UNIQUE INDEX purchase_access_tokens_one_active_per_order
    ON purchase_access_tokens (order_id)
    WHERE revoked_at IS NULL;
  `);

  pgm.sql(`
    CREATE TABLE fulfillment_outbox (
      id serial PRIMARY KEY,
      order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      channel varchar(10) NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      status varchar(20) NOT NULL DEFAULT 'pending',
      attempts integer NOT NULL DEFAULT 0,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT fulfillment_outbox_channel_check CHECK (channel IN ('email', 'sms')),
      CONSTRAINT fulfillment_outbox_status_check CHECK (status IN ('pending', 'sent', 'failed'))
    );
  `);
  pgm.createIndex("fulfillment_outbox", ["status", "created_at"]);
  pgm.createIndex("fulfillment_outbox", ["order_id"]);
};

/** @param {import("node-pg-migrate").MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("fulfillment_outbox", { ifExists: true });
  pgm.dropTable("purchase_access_tokens", { ifExists: true });
};
