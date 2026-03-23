function createAnalytics({ db, logger }) {
  async function trackEvent(eventName, payload = {}) {
    try {
      await db.query(
        `INSERT INTO analytics_events (event_name, payload)
         VALUES ($1, $2::jsonb)`,
        [eventName, JSON.stringify(payload)]
      );
    } catch (error) {
      logger.warn({ err: error, eventName }, "analytics_insert_failed");
    }
  }

  return {
    trackEvent
  };
}

module.exports = {
  createAnalytics
};
