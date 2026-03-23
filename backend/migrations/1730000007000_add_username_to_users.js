/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("users", {
    username: { type: "varchar(32)" }
  });

  pgm.sql(
    `UPDATE users
     SET username = CONCAT('user_', id)
     WHERE username IS NULL`
  );

  pgm.alterColumn("users", "username", {
    notNull: true
  });

  pgm.addConstraint(
    "users",
    "users_username_format_check",
    "CHECK (username ~ '^[a-z0-9_]{3,32}$')"
  );

  pgm.createIndex("users", "username", {
    unique: true,
    name: "users_username_unique_idx"
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("users", "username", {
    name: "users_username_unique_idx"
  });
  pgm.dropConstraint("users", "users_username_format_check");
  pgm.dropColumn("users", "username");
};
