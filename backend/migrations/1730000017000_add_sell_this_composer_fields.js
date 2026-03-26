/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("posts", {
    tags: {
      type: "text[]",
      notNull: true,
      default: "{}"
    }
  });
  pgm.createIndex("posts", ["tags"], { method: "gin" });

  pgm.alterColumn("creator_products", "delivery_media_key", {
    notNull: false
  });
  pgm.addColumns("creator_products", {
    product_type: {
      type: "varchar(20)",
      notNull: true,
      default: "digital"
    },
    service_details: {
      type: "text"
    },
    delivery_method: {
      type: "varchar(120)"
    },
    website_url: {
      type: "text"
    }
  });
  pgm.addConstraint(
    "creator_products",
    "creator_products_product_type_check",
    "CHECK (product_type IN ('digital','service','subscription'))"
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint("creator_products", "creator_products_product_type_check");
  pgm.dropColumns("creator_products", [
    "product_type",
    "service_details",
    "delivery_method",
    "website_url"
  ]);
  pgm.alterColumn("creator_products", "delivery_media_key", {
    notNull: true
  });
  pgm.dropIndex("posts", ["tags"], { method: "gin" });
  pgm.dropColumn("posts", "tags");
};
