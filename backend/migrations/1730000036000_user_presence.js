/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("user_presence", {
    user_id: {
      type: "integer",
      primaryKey: true,
      references: "users(id)",
      onDelete: "CASCADE",
    },
    last_seen_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
    is_online: {
      type: "boolean",
      notNull: true,
      default: false,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("user_presence");
};
