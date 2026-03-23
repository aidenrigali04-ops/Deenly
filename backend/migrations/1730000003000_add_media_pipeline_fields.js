/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("posts", {
    media_status: {
      type: "varchar(16)",
      notNull: true,
      default: "none"
    },
    visibility_status: {
      type: "varchar(16)",
      notNull: true,
      default: "visible"
    },
    media_upload_key: { type: "text" },
    media_mime_type: { type: "varchar(128)" },
    media_size_bytes: { type: "bigint" },
    media_duration_seconds: { type: "integer" },
    media_processing_error: { type: "text" },
    media_processed_at: { type: "timestamptz" }
  });

  pgm.addConstraint(
    "posts",
    "posts_media_status_check",
    "CHECK (media_status IN ('none', 'pending', 'ready', 'failed'))"
  );
  pgm.addConstraint(
    "posts",
    "posts_visibility_status_check",
    "CHECK (visibility_status IN ('visible', 'hidden'))"
  );
  pgm.createIndex("posts", ["media_status", "created_at"]);
  pgm.createIndex("posts", ["visibility_status", "created_at"]);
};

exports.down = (pgm) => {
  pgm.dropConstraint("posts", "posts_visibility_status_check");
  pgm.dropConstraint("posts", "posts_media_status_check");
  pgm.dropColumns("posts", [
    "media_status",
    "visibility_status",
    "media_upload_key",
    "media_mime_type",
    "media_size_bytes",
    "media_duration_seconds",
    "media_processing_error",
    "media_processed_at"
  ]);
};
