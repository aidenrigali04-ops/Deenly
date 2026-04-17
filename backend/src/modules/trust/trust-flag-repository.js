function createTrustFlagRepository() {
  /**
   * @param {import("pg").Pool | { query: Function }} queryable
   * @param {object} row normalized + validated
   */
  async function insertFlag(queryable, row) {
    const res = await queryable.query(
      `INSERT INTO trust_review_flags (
         domain,
         flag_type,
         severity,
         subject_user_id,
         related_entity_type,
         related_entity_id,
         metadata,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'open')
       RETURNING id, domain, flag_type, severity, subject_user_id, created_at`,
      [
        row.domain,
        row.flagType,
        row.severity,
        row.subjectUserId,
        row.relatedEntityType,
        row.relatedEntityId,
        JSON.stringify(row.metadata || {})
      ]
    );
    return res.rows[0];
  }

  return { insertFlag };
}

module.exports = {
  createTrustFlagRepository
};
