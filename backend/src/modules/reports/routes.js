const express = require("express");
const { authenticate, authorize } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { optionalString, requireString } = require("../../utils/validators");
const { getTrustSignalThresholds } = require("../trust/trust-signal-thresholds");

const REPORT_TARGET_TYPES = new Set(["post", "user", "comment"]);
const REPORT_STATUSES = new Set(["open", "reviewing", "resolved", "dismissed"]);
const MOD_ACTIONS = new Set(["hide_post", "remove_post", "suspend_user", "restore_post", "dismiss"]);
const REPORT_CATEGORIES = new Set([
  "haram_content",
  "misinformation",
  "harassment",
  "spam",
  "other"
]);

function createReportsRouter({ db, config, analytics, trustFlagService = null }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });
  const modGuard = authorize(["moderator", "admin"]);

  router.post(
    "/",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const targetType = requireString(req.body?.targetType, "targetType", 3, 16);
      if (!REPORT_TARGET_TYPES.has(targetType)) {
        throw httpError(400, "targetType must be post, user, or comment");
      }

      const targetId = requireString(req.body?.targetId, "targetId", 1, 64);
      const reason = requireString(req.body?.reason, "reason", 3, 200);
      const category =
        optionalString(req.body?.category, "category", 32) || "other";
      if (!REPORT_CATEGORIES.has(category)) {
        throw httpError(400, "Unsupported report category");
      }
      const notes = optionalString(req.body?.notes, "notes", 1000);
      const evidenceUrl = optionalString(req.body?.evidenceUrl, "evidenceUrl", 1000);

      const result = await db.query(
        `INSERT INTO reports (reporter_user_id, target_type, target_id, reason, notes, status, category, evidence_url)
         VALUES ($1, $2, $3, $4, $5, 'open', $6, $7)
         RETURNING id, reporter_user_id, target_type, target_id, reason, notes, status, category, evidence_url, created_at`,
        [req.user.id, targetType, targetId, reason, notes, category, evidenceUrl]
      );

      const thr = getTrustSignalThresholds(config);
      if (
        trustFlagService &&
        typeof trustFlagService.recordFlag === "function" &&
        thr.enabled &&
        targetType === "post" &&
        thr.rankingReportCategoriesForFlag.includes(category)
      ) {
        const postId = Number(targetId);
        if (Number.isInteger(postId) && postId > 0) {
          const pr = await db.query(`SELECT author_id FROM posts WHERE id = $1 LIMIT 1`, [postId]);
          const authorId = pr.rows[0] && pr.rows[0].author_id;
          if (authorId) {
            await trustFlagService.recordFlag(config, {
              domain: "ranking",
              flagType: "report_post_category_ranking_review",
              severity: "low",
              subjectUserId: Number(authorId),
              relatedEntityType: "report",
              relatedEntityId: String(result.rows[0].id),
              metadata: { postId: String(postId), category, reporterUserId: req.user.id }
            });
          }
        }
      }

      if (analytics) {
        await analytics.trackEvent("report_submitted", {
          reportId: result.rows[0].id,
          targetType
        });
      }

      res.status(201).json(result.rows[0]);
    })
  );

  router.get(
    "/queue",
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const status = (req.query.status || "open").toString();
      if (!REPORT_STATUSES.has(status)) {
        throw httpError(400, "Invalid status filter");
      }

      const result = await db.query(
        `SELECT id, reporter_user_id, target_type, target_id, reason, notes, status, category, evidence_url, reviewed_by, reviewed_at, created_at
         FROM reports
         WHERE status = $1
         ORDER BY created_at ASC
         LIMIT 100`,
        [status]
      );

      res.status(200).json({ items: result.rows });
    })
  );

  router.get(
    "/:reportId/actions",
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const reportId = Number(req.params.reportId);
      if (!reportId) {
        throw httpError(400, "reportId must be a number");
      }

      const result = await db.query(
        `SELECT id, report_id, moderator_user_id, action_type, note, created_at
         FROM moderation_actions
         WHERE report_id = $1
         ORDER BY created_at DESC`,
        [reportId]
      );

      res.status(200).json({ items: result.rows });
    })
  );

  router.post(
    "/:reportId/actions",
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const reportId = Number(req.params.reportId);
      if (!reportId) {
        throw httpError(400, "reportId must be a number");
      }

      const actionType = requireString(req.body?.actionType, "actionType", 4, 32);
      if (!MOD_ACTIONS.has(actionType)) {
        throw httpError(400, "Unsupported actionType");
      }

      const note = optionalString(req.body?.note, "note", 500);

      await db.query(
        `INSERT INTO moderation_actions (report_id, moderator_user_id, action_type, note)
         VALUES ($1, $2, $3, $4)`,
        [reportId, req.user.id, actionType, note]
      );

      if (actionType === "hide_post" || actionType === "remove_post" || actionType === "restore_post") {
        const target = await db.query(
          `SELECT target_id FROM reports WHERE id = $1 LIMIT 1`,
          [reportId]
        );
        if (target.rowCount === 0) {
          throw httpError(404, "Report not found");
        }
        const postId = Number(target.rows[0].target_id);
        if (postId) {
          if (actionType === "hide_post") {
            await db.query(
              `UPDATE posts
               SET visibility_status = 'hidden',
                   updated_at = NOW()
               WHERE id = $1`,
              [postId]
            );
          } else if (actionType === "remove_post") {
            await db.query(
              `UPDATE posts
               SET visibility_status = 'hidden',
                   removed_at = NOW(),
                   removed_by = $2,
                   updated_at = NOW()
               WHERE id = $1`,
              [postId, req.user.id]
            );
          } else {
            await db.query(
              `UPDATE posts
               SET visibility_status = 'visible',
                   removed_at = NULL,
                   removed_by = NULL,
                   updated_at = NOW()
               WHERE id = $1`,
              [postId]
            );
          }
        }
      }

      if (actionType === "suspend_user") {
        const target = await db.query(
          `SELECT target_id FROM reports WHERE id = $1 LIMIT 1`,
          [reportId]
        );
        if (target.rowCount === 0) {
          throw httpError(404, "Report not found");
        }
        const userId = Number(target.rows[0].target_id);
        if (userId) {
          await db.query(
            `UPDATE users
             SET is_active = false, updated_at = NOW()
             WHERE id = $1`,
            [userId]
          );
        }
      }

      const reportStatus = actionType === "dismiss" ? "dismissed" : "resolved";
      const report = await db.query(
        `UPDATE reports
         SET status = $3,
             reviewed_by = $1,
             reviewed_at = NOW()
         WHERE id = $2
         RETURNING id, status, reviewed_by, reviewed_at`,
        [req.user.id, reportId, reportStatus]
      );

      if (report.rowCount === 0) {
        throw httpError(404, "Report not found");
      }

      res.status(200).json(report.rows[0]);
    })
  );

  router.post(
    "/appeals",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const reportId = req.body?.reportId ? Number(req.body.reportId) : null;
      const restrictionId = req.body?.restrictionId
        ? Number(req.body.restrictionId)
        : null;
      const message = requireString(req.body?.message, "message", 10, 3000);

      const result = await db.query(
        `INSERT INTO appeals (user_id, report_id, restriction_id, message, status)
         VALUES ($1, $2, $3, $4, 'open')
         RETURNING id, user_id, report_id, restriction_id, message, status, created_at`,
        [req.user.id, reportId, restrictionId, message]
      );

      res.status(201).json(result.rows[0]);
    })
  );

  return router;
}

module.exports = {
  createReportsRouter
};
