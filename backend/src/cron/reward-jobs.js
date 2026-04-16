/**
 * Reward background jobs.
 *
 * Scheduled tasks:
 *   - dailyStreakBreakCheck   — detect broken streaks, decrement shields
 *   - dailyTierRequalification — recompute tiers on rolling 12-month window
 *   - dailyReferralReleases   — release held referral rewards past hold window
 *   - hourlyBoostExpiry       — mark active boosts past end time as completed
 *   - dailyChallengeExpiry    — expire challenges past their end date
 *   - weeklyTrustRecalc       — batch recompute trust scores
 *
 * Uses the built-in setInterval scheduler; can be swapped for a cron
 * library later. Each job is wrapped in try/catch and logs outcomes.
 */

const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;

/**
 * @param {{ logger, streakService, tierService, referralService, boostService, challengeService, trustService, config }} deps
 */
function createRewardJobs({
  logger,
  streakService,
  tierService,
  referralService,
  boostService,
  challengeService,
  trustService,
  config,
}) {
  const intervals = [];
  let running = false;

  async function runSafe(name, fn) {
    const start = Date.now();
    try {
      const result = await fn();
      logger.info({ job: name, durationMs: Date.now() - start, result }, "reward_job.success");
    } catch (err) {
      logger.error({ err, job: name }, "reward_job.failed");
    }
  }

  async function dailyStreakBreakCheck() {
    return runSafe("streak_break", () => streakService.batchBreakDetection({}));
  }

  async function dailyTierRequalification() {
    return runSafe("tier_requalify", () => tierService.batchRequalify({}));
  }

  async function dailyReferralReleases() {
    return runSafe("referral_releases", () => referralService.batchReleaseHolds());
  }

  async function hourlyBoostExpiry() {
    return runSafe("boost_expiry", () => boostService.batchExpire());
  }

  async function dailyChallengeExpiry() {
    return runSafe("challenge_expiry", () => challengeService.batchExpire());
  }

  async function weeklyTrustRecalc() {
    return runSafe("trust_recalc", () => trustService.batchRecalculate({ sinceDays: 7 }));
  }

  function start() {
    if (running) return;
    if (!config.rewardCronEnabled) {
      logger.info("reward_jobs.disabled");
      return;
    }
    running = true;
    logger.info("reward_jobs.starting");

    // Stagger: hourly tasks first, then spaced daily tasks.
    intervals.push(setInterval(hourlyBoostExpiry, ONE_HOUR));
    intervals.push(setInterval(dailyStreakBreakCheck, ONE_DAY));
    intervals.push(setInterval(dailyTierRequalification, ONE_DAY));
    intervals.push(setInterval(dailyReferralReleases, ONE_DAY));
    intervals.push(setInterval(dailyChallengeExpiry, ONE_DAY));
    intervals.push(setInterval(weeklyTrustRecalc, 7 * ONE_DAY));

    // Optional: fire once shortly after startup so we don't wait a full period.
    setTimeout(() => {
      hourlyBoostExpiry();
      dailyChallengeExpiry();
    }, 30 * 1000);
  }

  function stop() {
    for (const iv of intervals) clearInterval(iv);
    intervals.length = 0;
    running = false;
    logger.info("reward_jobs.stopped");
  }

  return {
    start,
    stop,
    // exported for manual triggering / tests
    dailyStreakBreakCheck,
    dailyTierRequalification,
    dailyReferralReleases,
    hourlyBoostExpiry,
    dailyChallengeExpiry,
    weeklyTrustRecalc,
  };
}

module.exports = { createRewardJobs };
