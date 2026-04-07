/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("events", {
    admission_price_minor: { type: "integer" },
    admission_currency: { type: "varchar(3)" }
  });
  pgm.sql(`
    ALTER TABLE events
    ADD CONSTRAINT events_admission_pair_check
    CHECK (
      (admission_price_minor IS NULL AND admission_currency IS NULL)
      OR (
        admission_price_minor IS NOT NULL
        AND admission_price_minor >= 50
        AND admission_currency IS NOT NULL
        AND char_length(trim(admission_currency)) = 3
      )
    );
  `);

  pgm.sql(`
    ALTER TABLE checkout_sessions
    DROP CONSTRAINT IF EXISTS checkout_sessions_kind_check;
  `);
  pgm.sql(`
    ALTER TABLE checkout_sessions
    ADD CONSTRAINT checkout_sessions_kind_check
    CHECK (kind IN ('product','support','subscription','event_ticket'));
  `);

  pgm.sql(`
    ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_kind_check;
  `);
  pgm.sql(`
    ALTER TABLE orders
    ADD CONSTRAINT orders_kind_check
    CHECK (kind IN ('product','support','subscription','event_ticket'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_kind_check;
  `);
  pgm.sql(`
    ALTER TABLE orders
    ADD CONSTRAINT orders_kind_check
    CHECK (kind IN ('product','support','subscription'));
  `);

  pgm.sql(`
    ALTER TABLE checkout_sessions
    DROP CONSTRAINT IF EXISTS checkout_sessions_kind_check;
  `);
  pgm.sql(`
    ALTER TABLE checkout_sessions
    ADD CONSTRAINT checkout_sessions_kind_check
    CHECK (kind IN ('product','support','subscription'));
  `);

  pgm.dropConstraint("events", "events_admission_pair_check", { ifExists: true });
  pgm.dropColumn("events", "admission_currency", { ifExists: true });
  pgm.dropColumn("events", "admission_price_minor", { ifExists: true });
};
