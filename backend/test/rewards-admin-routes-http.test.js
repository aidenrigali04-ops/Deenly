const request = require("supertest");
const jwt = require("jsonwebtoken");
const express = require("express");
const { authenticate, authorize } = require("../src/middleware/auth");
const { createAdminRouter } = require("../src/modules/admin/routes");

function requireAdminOwnerStub(req, _res, next) {
  return next();
}

describe("rewards admin routes (mounted)", () => {
  function buildApp({ sqlMatchers = [] } = {}) {
    const config = {
      jwtAccessSecret: "test-access-secret",
      adminOwnerEmail: "owner@test.com"
    };
    const db = {
      query: jest.fn(async (sql, params) => {
        const s = String(sql);
        for (const { when, rows } of sqlMatchers) {
          if (when(s)) {
            return { rows, rowCount: rows.length };
          }
        }
        if (s.includes("FROM users WHERE id = $1")) {
          return {
            rows: [
              {
                id: params[0],
                email: "owner@test.com",
                username: "owner",
                role: "admin",
                is_active: true,
                created_at: new Date()
              }
            ],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 0 };
      }),
      withTransaction: jest.fn(async (fn) => {
        const client = {
          query: db.query
        };
        return fn(client);
      })
    };
    const app = express();
    app.use(express.json());
    const api = express.Router();
    api.use(
      "/admin",
      authenticate({ config, db }),
      authorize(["moderator", "admin"]),
      requireAdminOwnerStub,
      createAdminRouter({
        db,
        config,
        pushNotifications: null,
        analytics: null,
        rewardsLedgerService: null
      })
    );
    app.use("/api/v1", api);
    return { app, db };
  }

  it("returns 401 without token for ledger list", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/v1/admin/rewards/ledger-entries");
    expect(res.statusCode).toBe(401);
  });

  it("returns ledger items for authorized admin", async () => {
    const ledgerRows = [
      {
        id: 1,
        delta_points: "10",
        entry_kind: "earn",
        reason: "signup_bonus",
        idempotency_key: "a",
        metadata: {},
        reverses_ledger_entry_id: null,
        created_at: new Date(),
        user_id: 5
      }
    ];
    const { app, db } = buildApp({
      sqlMatchers: [
        {
          when: (s) => s.includes("FROM reward_ledger_entries e") && s.includes("ORDER BY e.created_at"),
          rows: ledgerRows
        }
      ]
    });
    const token = jwt.sign({ sub: "1" }, "test-access-secret");
    const res = await request(app)
      .get("/api/v1/admin/rewards/ledger-entries")
      .set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].userId).toBe(5);
    expect(res.body.items[0].entryKind).toBe("earn");
    expect(db.query).toHaveBeenCalled();
  });

  it("returns fraud flags payload", async () => {
    const { app } = buildApp({
      sqlMatchers: [
        { when: (s) => s.includes("FROM checkout_reward_redemptions r"), rows: [] },
        { when: (s) => s.includes("entry_kind = 'reversal'"), rows: [] },
        { when: (s) => s.includes("WHERE ra.status = 'qualified'"), rows: [] },
        { when: (s) => s.includes("WHERE ra.status = 'voided'"), rows: [] }
      ]
    });
    const token = jwt.sign({ sub: "1" }, "test-access-secret");
    const res = await request(app)
      .get("/api/v1/admin/rewards/fraud-flags")
      .set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.thresholds).toBeDefined();
    expect(res.body.thresholds.redemptionVelocityWindowHours).toBe(24);
  });

  it("returns 401 for referral review without token", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/api/v1/admin/rewards/referrals/attributions/1/review")
      .send({ action: "reject", reason: "fraud_pattern" });
    expect(res.statusCode).toBe(401);
  });

  it("serves fraud flags on monetization admin rewards mirror (moderator)", async () => {
    const { registerRewardsAdminRoutes } = require("../src/modules/admin/rewards-admin-routes");
    const config = { jwtAccessSecret: "test-access-secret" };
    const db = {
      query: jest.fn(async (sql) => {
        const s = String(sql);
        if (s.includes("FROM users WHERE id = $1")) {
          return {
            rows: [
              {
                id: 1,
                email: "mod@test.com",
                username: "mod",
                role: "moderator",
                is_active: true,
                created_at: new Date()
              }
            ],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 0 };
      })
    };
    const app = express();
    app.use(express.json());
    const api = express.Router();
    const rewardsTeam = express.Router();
    rewardsTeam.use(authenticate({ config, db }), authorize(["moderator", "admin"]));
    registerRewardsAdminRoutes(
      rewardsTeam,
      {
        db,
        authMiddleware: (_req, _res, next) => next(),
        modGuard: (_req, _res, next) => next(),
        analytics: null,
        config,
        rewardsLedgerService: null
      },
      { routeBase: "" }
    );
    api.use("/monetization/admin/rewards", rewardsTeam);
    app.use("/api/v1", api);
    const token = jwt.sign({ sub: "1" }, "test-access-secret");
    const res = await request(app)
      .get("/api/v1/monetization/admin/rewards/fraud-flags")
      .set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.thresholds).toBeDefined();
  });
});
