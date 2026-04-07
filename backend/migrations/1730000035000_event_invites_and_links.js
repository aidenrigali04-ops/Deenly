/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("event_invite_links", {
    id: "id",
    event_id: {
      type: "integer",
      notNull: true,
      references: "events",
      onDelete: "CASCADE"
    },
    token_hash: { type: "varchar(128)", notNull: true },
    expires_at: { type: "timestamptz" },
    revoked_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") }
  });
  pgm.addConstraint("event_invite_links", "event_invite_links_token_hash_uq", "UNIQUE (token_hash)");
  pgm.createIndex("event_invite_links", ["event_id"], { name: "event_invite_links_event_idx" });

  pgm.createTable("event_user_invites", {
    event_id: {
      type: "integer",
      notNull: true,
      references: "events",
      onDelete: "CASCADE"
    },
    invited_user_id: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "CASCADE"
    },
    invited_by_user_id: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "CASCADE"
    },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") }
  });
  pgm.addConstraint("event_user_invites", "event_user_invites_pk", "PRIMARY KEY (event_id, invited_user_id)");
  pgm.createIndex("event_user_invites", ["invited_user_id"], { name: "event_user_invites_user_idx" });
};

exports.down = (pgm) => {
  pgm.dropTable("event_user_invites", { ifExists: true, cascade: true });
  pgm.dropTable("event_invite_links", { ifExists: true, cascade: true });
};
