/**
 * Reward Notifications Service
 *
 * Thin orchestrator over the existing push-notification service.
 * Handles domain-specific notifications: points earned, tier upgrade,
 * streak milestone, streak about to break, referral reward released,
 * challenge completed, boost completed/paused.
 *
 * All sends are fire-and-forget — callers never await for failures.
 */

/**
 * @param {{ pushService?, db, rewardConfig, logger? }} deps
 */
function createRewardNotificationsService({ pushService, db, rewardConfig, logger }) {
  async function send(userId, title, body, data = {}) {
    if (!pushService) return;
    try {
      await pushService.sendToUser(userId, { title, body, data });
    } catch (err) {
      if (logger) logger.warn({ err, userId, title }, "reward_notif.send.failed");
    }
  }

  function notifyPointsEarned({ userId, amount, source, balanceAfter }) {
    return send(
      userId,
      "You earned points!",
      `+${amount} Deenly Points from ${friendlySource(source)}. Balance: ${balanceAfter}.`,
      { type: "rewards.points.earned", amount, source, balance_after: balanceAfter }
    );
  }

  function notifyTierUpgraded({ userId, fromTier, toTier }) {
    return send(
      userId,
      `Welcome to ${capitalize(toTier)}!`,
      `You've been upgraded from ${capitalize(fromTier)}. Enjoy new perks.`,
      { type: "rewards.tier.upgraded", from_tier: fromTier, to_tier: toTier }
    );
  }

  function notifyTierDowngraded({ userId, fromTier, toTier }) {
    return send(
      userId,
      "Tier change",
      `Your tier is now ${capitalize(toTier)}. Keep earning to climb back!`,
      { type: "rewards.tier.downgraded", from_tier: fromTier, to_tier: toTier }
    );
  }

  function notifyStreakMilestone({ userId, streakDays, multiplier }) {
    return send(
      userId,
      `${streakDays}-day streak!`,
      `You're on fire. Current multiplier: ${multiplier}×.`,
      { type: "rewards.streak.milestone", streak_days: streakDays, multiplier }
    );
  }

  function notifyStreakAboutToBreak({ userId, streakDays, hoursLeft }) {
    return send(
      userId,
      "Don't lose your streak",
      `${streakDays}-day streak expires in ${hoursLeft}h. Check in now.`,
      { type: "rewards.streak.warning", streak_days: streakDays, hours_left: hoursLeft }
    );
  }

  function notifyReferralReleased({ userId, amount, referredUsername }) {
    return send(
      userId,
      "Referral reward!",
      `+${amount} points — ${referredUsername || "your friend"} completed their first order.`,
      { type: "growth.referral.completed", amount }
    );
  }

  function notifyChallengeCompleted({ userId, challengeName, reward }) {
    return send(
      userId,
      "Challenge complete!",
      `"${challengeName}" done. You earned ${reward} points.`,
      { type: "rewards.challenge.completed", reward }
    );
  }

  function notifyBoostCompleted({ sellerId, boostId, impressions }) {
    return send(
      sellerId,
      "Boost complete",
      `Your boost reached ${impressions || 0} shoppers.`,
      { type: "boost.completed", boost_id: boostId, impressions }
    );
  }

  function notifyBoostPaused({ sellerId, boostId, reason }) {
    return send(
      sellerId,
      "Boost paused",
      reason || "Your boost was paused.",
      { type: "boost.paused", boost_id: boostId }
    );
  }

  function notifyAccountFrozen({ userId, reason }) {
    return send(
      userId,
      "Account action required",
      "Your rewards account has been temporarily restricted. Contact support.",
      { type: "trust.account.frozen", reason }
    );
  }

  function friendlySource(source) {
    const map = {
      order_earn: "your purchase",
      streak_bonus: "your daily streak",
      challenge_reward: "a challenge",
      referral_reward: "a referral",
      admin_adjustment: "Deenly",
    };
    return map[source] || source;
  }

  function capitalize(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  return {
    notifyPointsEarned,
    notifyTierUpgraded,
    notifyTierDowngraded,
    notifyStreakMilestone,
    notifyStreakAboutToBreak,
    notifyReferralReleased,
    notifyChallengeCompleted,
    notifyBoostCompleted,
    notifyBoostPaused,
    notifyAccountFrozen,
  };
}

module.exports = { createRewardNotificationsService };
