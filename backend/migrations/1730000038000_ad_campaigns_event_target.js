/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("ad_campaigns", {
    event_id: {
      type: "integer",
      references: "events(id)",
      onDelete: "cascade"
    }
  });
  pgm.sql("ALTER TABLE ad_campaigns ALTER COLUMN post_id DROP NOT NULL");
  pgm.addConstraint(
    "ad_campaigns",
    "ad_campaigns_target_xor_check",
    "CHECK ((post_id IS NOT NULL AND event_id IS NULL) OR (post_id IS NULL AND event_id IS NOT NULL))"
  );
  pgm.createIndex("ad_campaigns", ["event_id"], {
    name: "ad_campaigns_event_id_idx"
  });
};

exports.down = (pgm) => {
  pgm.sql("DELETE FROM ad_campaigns WHERE event_id IS NOT NULL");
  pgm.dropConstraint("ad_campaigns", "ad_campaigns_target_xor_check", { ifExists: true });
  pgm.dropIndex("ad_campaigns", "ad_campaigns_event_id_idx", { ifExists: true });
  pgm.dropColumn("ad_campaigns", "event_id");
  pgm.sql("ALTER TABLE ad_campaigns ALTER COLUMN post_id SET NOT NULL");
};
