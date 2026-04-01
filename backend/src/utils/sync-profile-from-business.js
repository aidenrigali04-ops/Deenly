/**
 * Mirror business listing fields onto the user's profile for discovery (search) and display.
 */
async function syncProfileFromBusiness(db, userId, { name, description, websiteUrl }) {
  const safeName = String(name || "").trim().slice(0, 200);
  const safeDesc = String(description || "").trim().slice(0, 1800);
  const line = safeDesc ? `${safeName} — ${safeDesc}`.slice(0, 2000) : safeName.slice(0, 2000);
  if (!line) {
    return;
  }
  const web =
    websiteUrl != null && String(websiteUrl).trim() !== "" ? String(websiteUrl).trim().slice(0, 2048) : null;

  await db.query(
    `UPDATE profiles SET
       show_business_on_profile = true,
       website_url = COALESCE($1::text, website_url),
       business_offering = CASE
         WHEN COALESCE(TRIM(business_offering), '') = '' THEN $2
         WHEN POSITION($2 IN business_offering) > 0 THEN business_offering
         ELSE LEFT(TRIM(business_offering) || E'\n\n' || $2, 2000)
       END,
       updated_at = NOW()
     WHERE user_id = $3`,
    [web, line, userId]
  );
}

module.exports = {
  syncProfileFromBusiness
};
