/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("business_listings", {
    id: "id",
    owner_user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "SET NULL"
    },
    name: { type: "varchar(120)", notNull: true },
    slug: { type: "varchar(160)", notNull: true, unique: true },
    description: { type: "text" },
    website_url: { type: "text" },
    contact_email: { type: "varchar(254)" },
    contact_phone: { type: "varchar(32)" },
    address_display: { type: "varchar(500)" },
    latitude: { type: "double precision", notNull: true },
    longitude: { type: "double precision", notNull: true },
    category: { type: "varchar(64)" },
    visibility: {
      type: "varchar(16)",
      notNull: true,
      default: "draft"
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
    "business_listings",
    "business_listings_visibility_check",
    "CHECK (visibility IN ('draft', 'published'))"
  );
  pgm.createIndex("business_listings", "owner_user_id");
  pgm.createIndex("business_listings", "visibility");
  pgm.createIndex("business_listings", ["latitude", "longitude"]);
};

exports.down = (pgm) => {
  pgm.dropTable("business_listings");
};
