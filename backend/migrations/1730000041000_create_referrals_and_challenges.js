/* eslint-disable camelcase */

/**
 * Migration 2 of 3 — Referrals & Challenges
 *
 * Tables created:
 *   5. referral_codes          — Unique referral codes per user
 *   6. referral_relationships  — Referrer→referee mapping
 *   7. referral_events         — Lifecycle events for each referral
 *   8. referral_rewards        — Reward holds and releases
 *   9. challenge_definitions   — Admin-managed challenge templates
 *  10. user_challenges         — User enrollment + progress tracking
 *
 * Source of truth: Deenly Business Rules & Economics Specification
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ─── 5. referral_codes ────────────────────────────────────────────────
  // Each user gets one active referral code. Codes are short, shareable strings.
  pgm.sql(`
    CREATE TABLE referral_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code varchar(20) NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      total_uses integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      deactivated_at timestamptz,
      CONSTRAINT referral_codes_code_unique UNIQUE (code),
      CONSTRAINT referral_codes_total_uses_non_negative CHECK (total_uses >= 0)
    );
  `);
  pgm.createIndex("referral_codes", ["user_id"]);
  pgm.createIndex("referral_codes", ["code"], { unique: true });
  // One active code per user
  pgm.sql(`
    CREATE UNIQUE INDEX referral_codes_user_active_unique
    ON referral_codes (user_id) WHERE is_active = true;
  `);

  // ─── 6. referral_relationships ────────────────────────────────────────
  // Links a referrer to a referee. One referrer per referee, set at signup.
  pgm.sql(`
    CREATE TABLE referral_relationships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referee_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referral_code_id uuid NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
      status varchar(20) NOT NULL DEFAULT 'pending',
      device_fingerprint varchar(128),
      signup_ip varchar(45),
      qualified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT referral_relationships_referee_unique UNIQUE (referee_user_id),
      CONSTRAINT referral_relationships_no_self CHECK (referrer_user_id != referee_user_id),
      CONSTRAINT referral_relationships_status_check CHECK (
        status IN ('pending','qualified','rewarded','rejected','expired')
      )
    );
  `);
  pgm.createIndex("referral_relationships", ["referrer_user_id", "created_at"]);
  pgm.createIndex("referral_relationships", ["referee_user_id"]);
  pgm.createIndex("referral_relationships", ["referral_code_id"]);
  pgm.createIndex("referral_relationships", ["status"]);

  // ─── 7. referral_events ───────────────────────────────────────────────
  // Append-only log of referral lifecycle transitions.
  pgm.sql(`
    CREATE TABLE referral_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      referral_id uuid NOT NULL REFERENCES referral_relationships(id) ON DELETE CASCADE,
      event_type varchar(30) NOT NULL,
      metadata jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT referral_events_type_check CHECK (
        event_type IN (
          'code_used','signup_completed','first_purchase',
          'qualified','hold_started','hold_extended',
          'reward_released','reward_forfeited',
          'fraud_flagged','fraud_cleared','rejected'
        )
      )
    );
  `);
  pgm.createIndex("referral_events", ["referral_id", "created_at"]);
  pgm.createIndex("referral_events", ["event_type"]);

  // ─── 8. referral_rewards ──────────────────────────────────────────────
  // Tracks reward holds (14-day) and their release or forfeiture.
  pgm.sql(`
    CREATE TABLE referral_rewards (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      referral_id uuid NOT NULL REFERENCES referral_relationships(id) ON DELETE CASCADE,
      beneficiary_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reward_type varchar(20) NOT NULL,
      amount integer NOT NULL,
      currency varchar(3) NOT NULL DEFAULT 'dp',
      status varchar(20) NOT NULL DEFAULT 'held',
      hold_until timestamptz NOT NULL,
      hold_extended_count integer NOT NULL DEFAULT 0,
      ledger_entry_id uuid REFERENCES reward_ledger_entries(id) ON DELETE SET NULL,
      released_at timestamptz,
      forfeited_at timestamptz,
      forfeit_reason varchar(255),
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT referral_rewards_reward_type_check CHECK (
        reward_type IN ('referrer_points','referee_discount')
      ),
      CONSTRAINT referral_rewards_amount_positive CHECK (amount > 0),
      CONSTRAINT referral_rewards_status_check CHECK (
        status IN ('held','released','forfeited')
      ),
      CONSTRAINT referral_rewards_hold_extended_non_negative CHECK (hold_extended_count >= 0)
    );
  `);
  pgm.createIndex("referral_rewards", ["referral_id"]);
  pgm.createIndex("referral_rewards", ["beneficiary_user_id"]);
  pgm.createIndex("referral_rewards", ["status", "hold_until"]);

  // ─── 9. challenge_definitions ─────────────────────────────────────────
  // Admin-managed challenge templates. Criteria stored as JSONB for flexibility.
  pgm.sql(`
    CREATE TABLE challenge_definitions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title varchar(120) NOT NULL,
      description varchar(500),
      challenge_type varchar(20) NOT NULL,
      category varchar(30) NOT NULL DEFAULT 'general',
      criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
      reward_points integer NOT NULL,
      reward_badge varchar(60),
      max_participants integer,
      frequency varchar(20),
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      merchant_user_id integer REFERENCES users(id) ON DELETE SET NULL,
      created_by integer REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT challenge_definitions_type_check CHECK (
        challenge_type IN ('daily','weekly','monthly','merchant','special')
      ),
      CONSTRAINT challenge_definitions_category_check CHECK (
        category IN ('general','purchase','social','streak','exploration','merchant')
      ),
      CONSTRAINT challenge_definitions_reward_positive CHECK (reward_points > 0),
      CONSTRAINT challenge_definitions_dates_valid CHECK (ends_at > starts_at)
    );
  `);
  pgm.createIndex("challenge_definitions", ["challenge_type", "is_active"]);
  pgm.createIndex("challenge_definitions", ["starts_at", "ends_at"]);
  pgm.createIndex("challenge_definitions", ["merchant_user_id"], {
    where: "merchant_user_id IS NOT NULL"
  });

  // ─── 10. user_challenges ──────────────────────────────────────────────
  // Tracks individual user progress on a challenge.
  pgm.sql(`
    CREATE TABLE user_challenges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_id uuid NOT NULL REFERENCES challenge_definitions(id) ON DELETE CASCADE,
      progress integer NOT NULL DEFAULT 0,
      target integer NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'active',
      ledger_entry_id uuid REFERENCES reward_ledger_entries(id) ON DELETE SET NULL,
      enrolled_at timestamptz NOT NULL DEFAULT current_timestamp,
      completed_at timestamptz,
      reward_claimed_at timestamptz,
      expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT user_challenges_progress_non_negative CHECK (progress >= 0),
      CONSTRAINT user_challenges_target_positive CHECK (target > 0),
      CONSTRAINT user_challenges_status_check CHECK (
        status IN ('active','completed','claimed','expired','abandoned')
      ),
      CONSTRAINT user_challenges_unique_enrollment UNIQUE (user_id, challenge_id)
    );
  `);
  pgm.createIndex("user_challenges", ["user_id", "status"]);
  pgm.createIndex("user_challenges", ["challenge_id", "status"]);
  pgm.createIndex("user_challenges", ["expires_at"], {
    where: "status = 'active'"
  });
};

exports.down = (pgm) => {
  pgm.dropTable("user_challenges");
  pgm.dropTable("challenge_definitions");
  pgm.dropTable("referral_rewards");
  pgm.dropTable("referral_events");
  pgm.dropTable("referral_relationships");
  pgm.dropTable("referral_codes");
};
