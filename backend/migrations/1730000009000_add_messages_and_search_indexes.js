/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("conversations", {
    id: "id",
    created_by: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
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

  pgm.createTable("messages", {
    id: "id",
    conversation_id: {
      type: "integer",
      notNull: true,
      references: "conversations(id)",
      onDelete: "cascade"
    },
    sender_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    body: {
      type: "text",
      notNull: true
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createTable("conversation_participants", {
    id: "id",
    conversation_id: {
      type: "integer",
      notNull: true,
      references: "conversations(id)",
      onDelete: "cascade"
    },
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    last_read_message_id: {
      type: "integer",
      references: "messages(id)",
      onDelete: "set null"
    },
    last_read_at: {
      type: "timestamptz"
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createIndex("conversation_participants", ["conversation_id", "user_id"], { unique: true });
  pgm.createIndex("conversation_participants", ["user_id", "created_at"]);
  pgm.createIndex("messages", ["conversation_id", "id"]);
  pgm.createIndex("messages", ["sender_id", "created_at"]);
  pgm.createIndex("conversations", ["updated_at", "id"]);

  pgm.createIndex("profiles", "display_name");
  pgm.createIndex("users", "username");
  pgm.createIndex("posts", "content");
};

exports.down = (pgm) => {
  pgm.dropIndex("posts", "content");
  pgm.dropIndex("users", "username");
  pgm.dropIndex("profiles", "display_name");
  pgm.dropTable("messages");
  pgm.dropTable("conversation_participants");
  pgm.dropTable("conversations");
};
