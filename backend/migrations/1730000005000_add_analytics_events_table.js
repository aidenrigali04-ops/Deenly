/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("analytics_events", {
    id: "id",
    event_name: { type: "varchar(128)", notNull: true },
    payload: { type: "jsonb", notNull: true, default: "{}" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createIndex("analytics_events", "event_name");
  pgm.createIndex("analytics_events", "created_at");
};

exports.down = (pgm) => {
  pgm.dropTable("analytics_events");
};
