const request = require("supertest");
const jwt = require("jsonwebtoken");
const express = require("express");
const { authenticate, authorize } = require("../src/middleware/auth");
const { createAdminRouter } = require("../src/modules/admin/routes");

function requireAdminOwnerStub(req, _res, next) {
  return next();
}

describe("rewards admin routes (mounted)", () => {
  function buildApp({ sqlMatchers = [], userRole = "admin", referralService = null } = {}) {
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
                role: userRole,
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
        rewardsLedgerService: null,
        referralService
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
    const queueRow = {
      id: 1,
      flag_type: "velocity",
      severity: "medium",
      status: "open",
      subject_user_id: 2,
      related_entity_type: null,
      related_entity_id: null,
      reward_ledger_entry_id: null,
      referral_attribution_id: null,
      seller_boost_purchase_id: null,
      reviewer_user_id: null,
      reviewed_at: null,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date()
    };
    const { app } = buildApp({
      sqlMatchers: [
        { when: (s) => s.includes("FROM reward_fraud_flags"), rows: [queueRow] },
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
    expect(res.body.queuedRecords).toBeDefined();
    expect(res.body.queuedRecords.items[0].id).toBe(1);
  });

  it("returns 403 for rewards admin when role is not moderator", async () => {
    const { app } = buildApp({ userRole: "user" });
    const token = jwt.sign({ sub: "1" }, "test-access-secret");
    const res = await request(app)
      .get("/api/v1/admin/rewards/ledger-entries")
      .set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(403);
  });

  it("returns fraud flag record detail", async () => {
    const row = {
      id: 3,
      flag_type: "t",
      severity: "low",
      status: "triaged",
      subject_user_id: null,
      related_entity_type: "user",
      related_entity_id: "9",
      reward_ledger_entry_id: null,
      referral_attribution_id: null,
      seller_boost_purchase_id: null,
      reviewer_user_id: 1,
      reviewed_at: new Date(),
      metadata: {},
      created_at: new Date(),
      updated_at: new Date()
    };
    const { app } = buildApp({
      sqlMatchers: [{ when: (s) => s.includes("FROM reward_fraud_flags f") && s.includes("WHERE f.id = $1"), rows: [row] }]
    });
    const token = jwt.sign({ sub: "1" }, "test-access-secret");
    const res = await request(app)
      .get("/api/v1/admin/rewards/fraud-flags/records/3")
      .set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.flag.id).toBe(3);
  });

  it("POST fraud flag review dismiss", async () => {
    const config = { jwtAccessSecret: "test-access-secret" };
    const open = {
      id: 2,
      flag_type: "x",
      severity: "low",
      status: "open",
      subject_user_id: 1,
      related_entity_type: null,
      related_entity_id: null,
      reward_ledger_entry_id: null,
      referral_attribution_id: null,
      seller_boost_purchase_id: null,
      reviewer_user_id: null,
      reviewed_at: null,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date()
    };
    const dismissed = { ...open, status: "dismissed", reviewer_user_id: 1, reviewed_at: new Date() };
    let step = 0;
    const clientQuery = jest.fn(async () => {
      const seq = [{ rowCount: 1, rows: [open] }, { rowCount: 1, rows: [dismissed] }, { rowCount: 1, rows: [] }];
      return seq[step++];
    });
    const db = {
      query: jest.fn(async (sql) => {
        const s = String(sql);
        if (s.includes("FROM users WHERE id = $1")) {
          return {
            rows: [
              { id: 1, email: "a@t.com", username: "adm", role: "admin", is_active: true, created_at: new Date() }
            ],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 0 };
      }),
      withTransaction: jest.fn(async (fn) => fn({ query: clientQuery }))
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
        rewardsLedgerService: null,
        referralService: null
      })
    );
    app.use("/api/v1", api);
    const token = jwt.sign({ sub: "1" }, "test-access-secret");
    const res = await request(app)
      .post("/api/v1/admin/rewards/fraud-flags/records/2/review")
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "dismiss", notes: "false positive" });
    expect(res.statusCode).toBe(200);
    expect(res.body.flag.status).toBe("dismissed");
  });

  it("POST fraud-flags ingest returns insert counts", async () => {
    const { app } = buildApp({
      sqlMatchers: [
        { when: (s) => s.includes("FROM reward_fraud_flags"), rows: [] },
        { when: (s) => s.includes("FROM checkout_reward_redemptions r"), rows: [] },
        { when: (s) => s.includes("entry_kind = 'reversal'"), rows: [] },
        { when: (s) => s.includes("WHERE ra.status = 'qualified'"), rows: [] },
        { when: (s) => s.includes("WHERE ra.status = 'voided'"), rows: [] }
      ]
    });
    const token = jwt.sign({ sub: "1" }, "test-access-secret");
    const res = await request(app)
      .post("/api/v1/admin/rewards/fraud-flags/ingest")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.inserted).toBe("number");
    expect(res.body.inserted).toBe(0);
  });

  it("returns 503 for referral release_hold when referral service is not wired", async () => {
    const { app } = buildApp();
    const token = jwt.sign({ sub: "1" }, "test-access-secret");
    const res = await request(app)
      .post("/api/v1/admin/rewards/referrals/attributions/9/review")
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "release_hold" });
    expect(res.statusCode).toBe(503);
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
        rewardsLedgerService: null,
        referralService: null
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
