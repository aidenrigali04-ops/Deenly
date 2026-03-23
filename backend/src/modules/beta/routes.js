const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { optionalString, requireString } = require("../../utils/validators");
const { httpError } = require("../../utils/http-error");

function createBetaRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  router.post(
    "/waitlist",
    asyncHandler(async (req, res) => {
      const email = requireString(req.body?.email, "email", 5, 254).toLowerCase();
      const source = optionalString(req.body?.source, "source", 64) || "web";
      const note = optionalString(req.body?.note, "note", 300);
      const result = await db.query(
        `INSERT INTO waitlist_entries (email, source, note)
         VALUES ($1, $2, $3)
         ON CONFLICT (email)
         DO UPDATE SET source = EXCLUDED.source, note = EXCLUDED.note
         RETURNING id, email, source, note, created_at`,
        [email, source, note]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.post(
    "/invite/redeem",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const code = requireString(req.body?.code, "code", 8, 64);
      const inviteResult = await db.query(
        `SELECT id, code, max_uses, uses_count, is_active
         FROM beta_invites
         WHERE code = $1
         LIMIT 1`,
        [code]
      );
      if (inviteResult.rowCount === 0) {
        throw httpError(404, "Invite not found");
      }
      const invite = inviteResult.rows[0];
      if (!invite.is_active || invite.uses_count >= invite.max_uses) {
        throw httpError(400, "Invite is no longer valid");
      }

      const updated = await db.query(
        `UPDATE beta_invites
         SET uses_count = uses_count + 1,
             redeemed_by = $1,
             redeemed_at = NOW(),
             is_active = CASE WHEN uses_count + 1 >= max_uses THEN false ELSE true END
         WHERE id = $2
         RETURNING id, code, uses_count, max_uses, is_active, redeemed_by, redeemed_at`,
        [req.user.id, invite.id]
      );
      res.status(200).json(updated.rows[0]);
    })
  );

  return router;
}

module.exports = {
  createBetaRouter
};
