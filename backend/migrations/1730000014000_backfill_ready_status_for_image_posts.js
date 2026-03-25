/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    UPDATE posts
    SET media_status = 'ready',
        media_processed_at = COALESCE(media_processed_at, NOW()),
        media_processing_error = NULL,
        updated_at = NOW()
    WHERE media_status = 'processing'
      AND media_mime_type LIKE 'image/%'
      AND media_url IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    UPDATE posts
    SET media_status = 'processing',
        media_processed_at = NULL,
        updated_at = NOW()
    WHERE media_status = 'ready'
      AND media_mime_type LIKE 'image/%'
      AND media_url IS NOT NULL;
  `);
};
