/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("messages", {
    edited_at: { type: "timestamptz", default: null },
    deleted_at: { type: "timestamptz", default: null },
    deleted_for_sender_only: { type: "boolean", notNull: true, default: false }
  });

  pgm.addColumns("conversation_participants", {
    archived_at: { type: "timestamptz", default: null }
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("conversation_participants", ["archived_at"]);
  pgm.dropColumns("messages", ["edited_at", "deleted_at", "deleted_for_sender_only"]);
};
