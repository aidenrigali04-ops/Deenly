/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("trust_review_flags", {
    id: "id",
    domain: {
      type: "varchar(32)",
      notNull: true
    },
    flag_type: {
      type: "varchar(96)",
      notNull: true
    },
    severity: {
      type: "varchar(16)",
      notNull: true,
      default: "low"
    },
    subject_user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
    related_entity_type: {
      type: "varchar(48)"
    },
    related_entity_id: {
      type: "varchar(128)"
    },
    metadata: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "open"
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

  pgm.addConstraint(
    "trust_review_flags",
    "trust_review_flags_domain_check",
    "CHECK (domain IN ('referral','rewards','boost','refund','ranking'))"
  );
  pgm.addConstraint(
    "trust_review_flags",
    "trust_review_flags_severity_check",
    "CHECK (severity IN ('info','low','medium','high'))"
  );
  pgm.addConstraint(
    "trust_review_flags",
    "trust_review_flags_status_check",
    "CHECK (status IN ('open','acknowledged','dismissed'))"
  );

  pgm.createIndex("trust_review_flags", ["domain", "status", "created_at"]);
  pgm.createIndex("trust_review_flags", ["subject_user_id", "created_at"]);
  pgm.createIndex("trust_review_flags", ["related_entity_type", "related_entity_id"]);
};

exports.down = (pgm) => {
  pgm.dropTable("trust_review_flags");
};
