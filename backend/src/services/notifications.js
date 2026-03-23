async function createNotification(db, userId, type, payload = {}) {
  if (!userId) {
    return;
  }

  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, payload)
       VALUES ($1, $2, $3::jsonb)`,
      [userId, type, JSON.stringify(payload)]
    );
  } catch {
    // Notification delivery is best-effort and should not break request flow.
  }
}

module.exports = {
  createNotification
};
