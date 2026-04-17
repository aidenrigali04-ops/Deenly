const DEFAULT_PORT = 3000;
const { URL } = require("node:url");
const { normalizeBlockedHostEntry } = require("../utils/content-safety");
const { assertFeedRankModifierGuardrails } = require("../modules/feed/feed-rank-modifiers");
const VALID_NODE_ENVS = new Set(["development", "test", "production"]);
const VALID_DB_SSL_MODES = new Set(["disable", "require", "no-verify"]);
const VALID_MEDIA_PROVIDERS = new Set(["mock", "s3"]);

function parsePort(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_PORT;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return parsed;
}

function parseCorsOrigins(value, nodeEnv) {
  const raw = value || "";
  const list = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (nodeEnv === "production" && list.length === 0) {
    throw new Error(
      "CORS_ORIGINS is required in production (comma-separated origins)"
    );
  }

  return list;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).toLowerCase() === "true";
}

function parseNumber(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Invalid numeric value in environment configuration");
  }
  return parsed;
}

function parsePositiveInt(value, defaultValue, fieldName) {
  const parsed = parseNumber(value, defaultValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

function parseFeeBpsBound(value, defaultValue, fieldName) {
  const parsed = parseNumber(value, defaultValue);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) {
    throw new Error(`${fieldName} must be an integer between 0 and 10000`);
  }
  return parsed;
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseOptionalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("MEDIA_PUBLIC_BASE_URL must be a valid absolute URL");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function parseRequiredUrl(value, fieldName) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  try {
    const parsed = new URL(raw);
    return parsed.toString();
  } catch {
    throw new Error(`${fieldName} must be a valid absolute URL`);
  }
}

function loadEnv(envSource = process.env) {
  const nodeEnv = envSource.NODE_ENV || "development";
  if (!VALID_NODE_ENVS.has(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }
  const corsOrigins = parseCorsOrigins(envSource.CORS_ORIGINS, nodeEnv);
  const explicitAppBaseUrl = parseRequiredUrl(envSource.APP_BASE_URL, "APP_BASE_URL");
  const corsDerivedAppBaseUrl = corsOrigins[0]
    ? parseRequiredUrl(corsOrigins[0], "CORS_ORIGINS first value")
    : "";
  const derivedAppBaseUrl =
    explicitAppBaseUrl || parseOptionalUrl(envSource.MEDIA_PUBLIC_BASE_URL) || corsDerivedAppBaseUrl;

  const config = {
    nodeEnv,
    isProduction: nodeEnv === "production",
    isTest: nodeEnv === "test",
    port: parsePort(envSource.PORT),
    databaseUrl: envSource.DATABASE_URL || "",
    dbSslMode: envSource.DB_SSL_MODE || "require",
    corsOrigins,
    jwtAccessSecret: envSource.JWT_ACCESS_SECRET || "",
    jwtRefreshSecret: envSource.JWT_REFRESH_SECRET || "",
    jwtAccessTtl: envSource.JWT_ACCESS_TTL || "15m",
    jwtRefreshTtl: envSource.JWT_REFRESH_TTL || "30d",
    logLevel: envSource.LOG_LEVEL || "info",
    trustProxy: parseBoolean(envSource.TRUST_PROXY, false),
    adminOwnerEmail: String(envSource.ADMIN_OWNER_EMAIL || "").trim().toLowerCase(),
    processingWebhookToken: envSource.PROCESSING_WEBHOOK_TOKEN || "",
    mediaAsyncVideoProcessing: parseBoolean(envSource.MEDIA_ASYNC_VIDEO_PROCESSING, false),
    mediaProvider: envSource.MEDIA_PROVIDER || "mock",
    mediaMaxUploadBytes: parseNumber(envSource.MEDIA_MAX_UPLOAD_BYTES, 100 * 1024 * 1024),
    mediaAllowedMimeTypes: parseList(
      envSource.MEDIA_ALLOWED_MIME_TYPES ||
        "video/mp4,video/quicktime,audio/mpeg,audio/wav,image/jpeg,image/png"
    ),
    awsRegion: envSource.AWS_REGION || "",
    awsS3Bucket: envSource.AWS_S3_BUCKET || "",
    mediaPublicBaseUrl: parseOptionalUrl(envSource.MEDIA_PUBLIC_BASE_URL),
    googleClientId: String(envSource.GOOGLE_CLIENT_ID || "").trim(),
    commentBlockedTerms: (() => {
      const merged = [
        ...parseList(envSource.COMMENT_BLOCKED_TERMS),
        ...parseList(envSource.CONTENT_BLOCKED_TERMS)
      ];
      return [...new Set(merged.map((t) => String(t).trim()).filter(Boolean))];
    })(),
    blockedUrlHosts: parseList(envSource.BLOCKED_URL_HOSTS)
      .map((entry) => normalizeBlockedHostEntry(entry))
      .filter(Boolean),
    mockUploadBaseUrl: envSource.MOCK_UPLOAD_BASE_URL || "",
    viewDedupeWindowSeconds: parsePositiveInt(
      envSource.VIEW_DEDUPE_WINDOW_SECONDS,
      45,
      "VIEW_DEDUPE_WINDOW_SECONDS"
    ),
    authLoginRateLimitWindowMs: parsePositiveInt(
      envSource.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000,
      "AUTH_LOGIN_RATE_LIMIT_WINDOW_MS"
    ),
    authLoginRateLimitMax: parsePositiveInt(
      envSource.AUTH_LOGIN_RATE_LIMIT_MAX,
      12,
      "AUTH_LOGIN_RATE_LIMIT_MAX"
    ),
    authRegisterRateLimitWindowMs: parsePositiveInt(
      envSource.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000,
      "AUTH_REGISTER_RATE_LIMIT_WINDOW_MS"
    ),
    authRegisterRateLimitMax: parsePositiveInt(
      envSource.AUTH_REGISTER_RATE_LIMIT_MAX,
      10,
      "AUTH_REGISTER_RATE_LIMIT_MAX"
    ),
    adsCampaignCreateRateLimitWindowMs: parsePositiveInt(
      envSource.ADS_CAMPAIGN_CREATE_RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000,
      "ADS_CAMPAIGN_CREATE_RATE_LIMIT_WINDOW_MS"
    ),
    adsCampaignCreateRateLimitMax: parsePositiveInt(
      envSource.ADS_CAMPAIGN_CREATE_RATE_LIMIT_MAX,
      40,
      "ADS_CAMPAIGN_CREATE_RATE_LIMIT_MAX"
    ),
    adsBoostCheckoutRateLimitWindowMs: parsePositiveInt(
      envSource.ADS_BOOST_CHECKOUT_RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000,
      "ADS_BOOST_CHECKOUT_RATE_LIMIT_WINDOW_MS"
    ),
    adsBoostCheckoutRateLimitMax: parsePositiveInt(
      envSource.ADS_BOOST_CHECKOUT_RATE_LIMIT_MAX,
      25,
      "ADS_BOOST_CHECKOUT_RATE_LIMIT_MAX"
    ),
    feedRankWeights: {
      comment: parseNumber(envSource.FEED_RANK_COMMENT_WEIGHT, 120),
      benefited: parseNumber(envSource.FEED_RANK_BENEFITED_WEIGHT, 60),
      watchTimeSeconds: parseNumber(envSource.FEED_RANK_WATCH_SECONDS_WEIGHT, 1),
      completionRate: parseNumber(envSource.FEED_RANK_COMPLETION_RATE_WEIGHT, 2),
      followBoost: parseNumber(envSource.FEED_RANK_FOLLOW_BOOST_WEIGHT, 300),
      affinity: parseNumber(envSource.FEED_RANK_AFFINITY_WEIGHT, 45),
      interestBoost: parseNumber(envSource.FEED_RANK_INTEREST_BOOST_WEIGHT, 220)
    },
    feedSponsoredInsertEvery: parsePositiveInt(
      envSource.FEED_SPONSORED_INSERT_EVERY,
      6,
      "FEED_SPONSORED_INSERT_EVERY"
    ),
    feedTrustReportPenaltyWeight: parseNumber(envSource.FEED_TRUST_REPORT_PENALTY_WEIGHT, 250),
    feedAudienceTabBoostWeight: parseNumber(envSource.FEED_AUDIENCE_TAB_BOOST_WEIGHT, 1),
    feedRankPlatformFeeWeight: parseNumber(envSource.FEED_RANK_PLATFORM_FEE_WEIGHT, 3),
    feedEventInsertEvery: parsePositiveInt(envSource.FEED_EVENT_INSERT_EVERY, 8, "FEED_EVENT_INSERT_EVERY"),
    feedEventCandidatesLimit: parsePositiveInt(
      envSource.FEED_EVENT_CANDIDATES_LIMIT,
      6,
      "FEED_EVENT_CANDIDATES_LIMIT"
    ),
    feedRankPlatformFeeCapBps: (() => {
      const v = parseNumber(envSource.FEED_RANK_PLATFORM_FEE_CAP_BPS, 3500);
      if (!Number.isInteger(v) || v < 0 || v > 3500) {
        throw new Error("FEED_RANK_PLATFORM_FEE_CAP_BPS must be an integer between 0 and 3500");
      }
      return v;
    })(),
    feedRankOnboardingIntentWeight: (() => {
      const v = parseNumber(envSource.FEED_RANK_ONBOARDING_INTENT_WEIGHT, 60);
      if (!Number.isFinite(v) || v < 0 || v > 500) {
        throw new Error("FEED_RANK_ONBOARDING_INTENT_WEIGHT must be a number between 0 and 500");
      }
      return v;
    })(),
    feedRewardsRankingEnabled: parseBoolean(envSource.FEED_REWARDS_RANKING_ENABLED, false),
    feedRankModifiersDebug: parseBoolean(envSource.FEED_RANK_MODIFIERS_DEBUG, false),
    feedRankModifierAnalyticsSampleRate: (() => {
      const v = parseNumber(envSource.FEED_RANK_MODIFIER_ANALYTICS_SAMPLE_RATE, 0.02);
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error("FEED_RANK_MODIFIER_ANALYTICS_SAMPLE_RATE must be between 0 and 1");
      }
      return v;
    })(),
    /** Append-only rows in feed_ranking_signals (off by default; feed rank still reads live aggregates). */
    feedRankingSignalStoreEnabled: parseBoolean(envSource.FEED_RANKING_SIGNAL_STORE_ENABLED, false),
    feedSellerBoostRankingEnabled: parseBoolean(envSource.FEED_SELLER_BOOST_RANKING_ENABLED, false),
    feedSellerBoostRankCap: (() => {
      const v = parseNumber(envSource.FEED_SELLER_BOOST_RANK_CAP, 60);
      if (!Number.isFinite(v) || v < 0 || v > 500) {
        throw new Error("FEED_SELLER_BOOST_RANK_CAP must be a number between 0 and 500");
      }
      return v;
    })(),
    feedSellerBoostRankWeight: (() => {
      const v = parseNumber(envSource.FEED_SELLER_BOOST_RANK_WEIGHT, 1);
      if (!Number.isFinite(v) || v < 0 || v > 10) {
        throw new Error("FEED_SELLER_BOOST_RANK_WEIGHT must be a number between 0 and 10");
      }
      return v;
    })(),
    /** Upper bound on catalog `rankModifierPoints` for seller boost tiers (defense in depth vs feed cap). */
    sellerBoostRankModifierPointsCap: parsePositiveInt(
      envSource.SELLER_BOOST_RANK_MODIFIER_POINTS_CAP,
      500,
      "SELLER_BOOST_RANK_MODIFIER_POINTS_CAP"
    ),
    feedRankModifiers: {
      capEngagementAdditive: parseNumber(envSource.FEED_RANK_MODIFIER_CAP_ENGAGEMENT, 42),
      weightEngagement: parseNumber(envSource.FEED_RANK_MODIFIER_WEIGHT_ENGAGEMENT, 1),
      capBoostTierAdditive: parseNumber(envSource.FEED_RANK_MODIFIER_CAP_BOOST_TIER, 24),
      weightBoostTierUnit: parseNumber(envSource.FEED_RANK_MODIFIER_WEIGHT_BOOST_TIER_UNIT, 12),
      capSalesLnAdditive: parseNumber(envSource.FEED_RANK_MODIFIER_CAP_SALES, 16),
      weightSalesLn: parseNumber(envSource.FEED_RANK_MODIFIER_WEIGHT_SALES_LN, 6),
      combinedPositiveCap: parseNumber(envSource.FEED_RANK_MODIFIER_COMBINED_POSITIVE_CAP, 72),
      capConversionProxyAdditive: parseNumber(envSource.FEED_RANK_MODIFIER_CAP_CONVERSION, 12),
      weightConversionProxy: parseNumber(envSource.FEED_RANK_MODIFIER_WEIGHT_CONVERSION, 10),
      capSellerTrustSubtract: parseNumber(envSource.FEED_RANK_MODIFIER_CAP_SELLER_TRUST_SUB, 22),
      weightSellerOpenReports: parseNumber(envSource.FEED_RANK_MODIFIER_WEIGHT_SELLER_REPORTS, 5),
      boostMaxFractionOfCombined: parseNumber(envSource.FEED_RANK_MODIFIER_BOOST_MAX_FRACTION, 0.38),
      engagementProxyWeightCompletion: parseNumber(envSource.FEED_RANK_MODIFIER_ENGAGEMENT_W_COMPLETION, 0.44),
      engagementProxyWeightViews: parseNumber(envSource.FEED_RANK_MODIFIER_ENGAGEMENT_W_VIEWS, 0.28),
      engagementProxyWeightSocial: parseNumber(envSource.FEED_RANK_MODIFIER_ENGAGEMENT_W_SOCIAL, 0.28),
      engagementProxyViewCapDivisor: parseNumber(envSource.FEED_RANK_MODIFIER_ENGAGEMENT_VIEW_CAP_DIVISOR, 4000),
      engagementProxySocialCapDivisor: parseNumber(envSource.FEED_RANK_MODIFIER_ENGAGEMENT_SOCIAL_CAP_DIVISOR, 55)
    },
    stripeSecretKey: String(envSource.STRIPE_SECRET_KEY || "").trim(),
    stripeWebhookSecret: String(envSource.STRIPE_WEBHOOK_SECRET || "").trim(),
    stripeConnectClientId: String(envSource.STRIPE_CONNECT_CLIENT_ID || "").trim(),
    plaidClientId: String(envSource.PLAID_CLIENT_ID || "").trim(),
    plaidSecret: String(envSource.PLAID_SECRET || "").trim(),
    plaidEnv: String(envSource.PLAID_ENV || "sandbox").trim().toLowerCase(),
    plaidTokenEncryptionKey: String(envSource.PLAID_TOKEN_ENCRYPTION_KEY || "").trim(),
    monetizationPlatformFeeBpsMin: parseFeeBpsBound(
      envSource.MONETIZATION_PLATFORM_FEE_BPS_MIN,
      50,
      "MONETIZATION_PLATFORM_FEE_BPS_MIN"
    ),
    monetizationPlatformFeeBpsMax: parseFeeBpsBound(
      envSource.MONETIZATION_PLATFORM_FEE_BPS_MAX,
      3500,
      "MONETIZATION_PLATFORM_FEE_BPS_MAX"
    ),
    monetizationPlatformFeeBps: parsePositiveInt(
      envSource.MONETIZATION_PLATFORM_FEE_BPS,
      350,
      "MONETIZATION_PLATFORM_FEE_BPS"
    ),
    monetizationEnableBoostedTier: parseBoolean(envSource.MONETIZATION_ENABLE_BOOSTED_TIER, true),
    monetizationEnableAggressiveTier: parseBoolean(envSource.MONETIZATION_ENABLE_AGGRESSIVE_TIER, false),
    monetizationFeeExperimentEnabled: parseBoolean(envSource.MONETIZATION_FEE_EXPERIMENT_ENABLED, false),
    monetizationAllowSubscriptionProductType: parseBoolean(
      envSource.MONETIZATION_ALLOW_SUBSCRIPTION_PRODUCT_TYPE,
      false
    ),
    affiliateGlobalCommissionBps: parsePositiveInt(
      envSource.AFFILIATE_GLOBAL_COMMISSION_BPS,
      700,
      "AFFILIATE_GLOBAL_COMMISSION_BPS"
    ),
    appBaseUrl: derivedAppBaseUrl,
    metaAppId: String(envSource.META_APP_ID || "").trim(),
    metaAppSecret: String(envSource.META_APP_SECRET || "").trim(),
    metaOauthRedirectUri: parseRequiredUrl(envSource.META_OAUTH_REDIRECT_URI, "META_OAUTH_REDIRECT_URI"),
    instagramGraphApiVersion: String(envSource.INSTAGRAM_GRAPH_API_VERSION || "v21.0").trim(),
    metaTokenEncryptionKey: String(envSource.META_TOKEN_ENCRYPTION_KEY || "").trim(),
    metaOauthStateSecret: String(envSource.META_OAUTH_STATE_SECRET || "").trim(),
    openaiApiKey: String(envSource.OPENAI_API_KEY || "").trim(),
    openaiModel: String(envSource.OPENAI_MODEL || "gpt-4o-mini").trim(),
    sendgridApiKey: String(envSource.SENDGRID_API_KEY || "").trim(),
    sendgridFromEmail: String(envSource.SENDGRID_FROM_EMAIL || "").trim(),
    twilioAccountSid: String(envSource.TWILIO_ACCOUNT_SID || "").trim(),
    twilioAuthToken: String(envSource.TWILIO_AUTH_TOKEN || "").trim(),
    twilioFromNumber: String(envSource.TWILIO_FROM_NUMBER || "").trim(),
    purchaseAccessTokenTtlDays: (() => {
      const v = parseNumber(envSource.PURCHASE_ACCESS_TOKEN_TTL_DAYS, 14);
      const n = Math.round(v);
      if (!Number.isInteger(n) || n < 1) {
        return 14;
      }
      return Math.min(365, n);
    })(),
    fulfillmentEmailEnabled: parseBoolean(envSource.FULFILLMENT_EMAIL_ENABLED, true),
    fulfillmentSmsEnabled: parseBoolean(envSource.FULFILLMENT_SMS_ENABLED, true),
    eventsFeatureEnabled: parseBoolean(envSource.EVENTS_FEATURE_ENABLED, true),
    eventsReadEnabled: parseBoolean(envSource.EVENTS_READ_ENABLED, true),
    eventsCreateEnabled: parseBoolean(envSource.EVENTS_CREATE_ENABLED, true),
    eventsChatEnabled: parseBoolean(envSource.EVENTS_CHAT_ENABLED, true),
    growthExperimentsEnabled: parseBoolean(envSource.GROWTH_EXPERIMENTS_ENABLED, true),
    eventsChatGraceHours: parsePositiveInt(envSource.EVENTS_CHAT_GRACE_HOURS, 24, "EVENTS_CHAT_GRACE_HOURS"),
    rolloutStage: String(envSource.ROLLOUT_STAGE || "read").trim().toLowerCase(),
    rolloutCohortPercent: parsePositiveInt(envSource.ROLLOUT_COHORT_PERCENT, 10, "ROLLOUT_COHORT_PERCENT"),
    rolloutGuardrailCheckoutConversionMin: parseNumber(envSource.ROLLOUT_GUARDRAIL_CHECKOUT_CONVERSION_MIN, 0.02),
    rolloutGuardrailQuickActionCtrMin: parseNumber(envSource.ROLLOUT_GUARDRAIL_QUICK_ACTION_CTR_MIN, 0.05),
    rolloutGuardrailOpenReportsMax: parsePositiveInt(
      envSource.ROLLOUT_GUARDRAIL_OPEN_REPORTS_MAX,
      200,
      "ROLLOUT_GUARDRAIL_OPEN_REPORTS_MAX"
    ),
    anonymousPostingUserId: (() => {
      const raw = envSource.ANONYMOUS_POSTING_USER_ID;
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        return null;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("ANONYMOUS_POSTING_USER_ID must be a positive integer when set");
      }
      return n;
    })(),
    trustSignalsEnabled: parseBoolean(envSource.TRUST_SIGNALS_ENABLED, false),
    trustDisposableEmailDomainsRaw: String(envSource.TRUST_DISPOSABLE_EMAIL_DOMAINS || "").trim(),
    trustRewardsEarnFlagPointsMinor: Math.max(
      0,
      Math.round(parseNumber(envSource.TRUST_REWARDS_EARN_FLAG_POINTS_MINOR, 5000))
    ),
    trustRewardsSpendFlagPointsMinor: Math.max(
      0,
      Math.round(parseNumber(envSource.TRUST_REWARDS_SPEND_FLAG_POINTS_MINOR, 8000))
    ),
    trustRefundRapidFlagWithinHours: Math.max(
      1,
      Math.round(parseNumber(envSource.TRUST_REFUND_RAPID_FLAG_WITHIN_HOURS, 72))
    ),
    trustBoostBudgetFlagMinor: Math.max(
      0,
      Math.round(parseNumber(envSource.TRUST_BOOST_BUDGET_FLAG_MINOR, 500_000))
    ),
    trustRankingReportCategoriesRaw: String(envSource.TRUST_RANKING_REPORT_CATEGORIES || "").trim(),
    trustReferralFlagSameEmailDomain: parseBoolean(envSource.TRUST_REFERRAL_FLAG_SAME_EMAIL_DOMAIN, true),
    trustReferralFlagDisposableRefereeEmail: parseBoolean(
      envSource.TRUST_REFERRAL_FLAG_DISPOSABLE_REFEREE_EMAIL,
      true
    ),
    trustReferralFlagSharedSignupIp: parseBoolean(envSource.TRUST_REFERRAL_FLAG_SHARED_SIGNUP_IP, true),
    trustReferralBlockDisposableEmail: parseBoolean(envSource.TRUST_REFERRAL_BLOCK_DISPOSABLE_EMAIL, false),
    trustCommerceOrderFlagMinor: Math.max(
      0,
      Math.round(parseNumber(envSource.TRUST_COMMERCE_ORDER_FLAG_MINOR, 500_000))
    ),
    trustRewardsCheckoutDiscountFlagBps: Math.max(
      0,
      Math.round(parseNumber(envSource.TRUST_REWARDS_CHECKOUT_DISCOUNT_FLAG_BPS, 9000))
    ),
    trustRewardsCheckoutReversalFlag: parseBoolean(envSource.TRUST_REWARDS_CHECKOUT_REVERSAL_FLAG, true),
    trustSellerBoostSpendFlagMinor: Math.max(
      0,
      Math.round(parseNumber(envSource.TRUST_SELLER_BOOST_SPEND_FLAG_MINOR, 1500))
    ),
    trustReferralClawbackFlagEnabled: parseBoolean(envSource.TRUST_REFERRAL_CLAWBACK_FLAG_ENABLED, true),
    referralsEnabled: parseBoolean(envSource.REFERRALS_ENABLED, false),
    referralAttributionWindowDays: (() => {
      const v = Math.round(parseNumber(envSource.REFERRAL_ATTRIBUTION_WINDOW_DAYS, 30));
      if (!Number.isInteger(v) || v < 1 || v > 365) {
        throw new Error("REFERRAL_ATTRIBUTION_WINDOW_DAYS must be an integer between 1 and 365");
      }
      return v;
    })(),
    referralMaxReferrerRewardsPerDay: (() => {
      const v = Math.round(parseNumber(envSource.REFERRAL_MAX_REFERRER_REWARDS_PER_DAY, 50));
      if (!Number.isInteger(v) || v < 0) {
        throw new Error("REFERRAL_MAX_REFERRER_REWARDS_PER_DAY must be a non-negative integer");
      }
      return v;
    })(),
    referralDefaultCodeMaxRedemptions: (() => {
      const v = Math.round(parseNumber(envSource.REFERRAL_DEFAULT_CODE_MAX_REDEMPTIONS, 100));
      if (!Number.isInteger(v) || v < 1) {
        throw new Error("REFERRAL_DEFAULT_CODE_MAX_REDEMPTIONS must be a positive integer");
      }
      return v;
    })(),
    referralReferrerRewardPointsMinor: Math.max(
      0,
      Math.round(parseNumber(envSource.REFERRAL_REFERRER_REWARD_POINTS_MINOR, 500))
    ),
    referralRefereeRewardPointsMinor: Math.max(
      0,
      Math.round(parseNumber(envSource.REFERRAL_REFEREE_REWARD_POINTS_MINOR, 0))
    ),
    referralMinQualifyingOrderAmountMinor: Math.max(
      0,
      Math.round(parseNumber(envSource.REFERRAL_MIN_QUALIFYING_ORDER_AMOUNT_MINOR, 1))
    ),
    referralQualifyingOrderKinds: (() => {
      const raw = parseList(
        envSource.REFERRAL_QUALIFYING_ORDER_KINDS || "product,support,subscription,event_ticket"
      );
      return raw.length ? raw : ["product", "support", "subscription", "event_ticket"];
    })(),
    referralHoldClearHoursAfterOrder: Math.max(
      0,
      Math.round(parseNumber(envSource.REFERRAL_HOLD_CLEAR_HOURS_AFTER_ORDER, 0))
    ),
    referralAllowBuyerIsSeller: parseBoolean(envSource.REFERRAL_ALLOW_BUYER_IS_SELLER, false),
    rewardsMinBalanceMinor: Math.max(0, Math.round(parseNumber(envSource.REWARDS_MIN_BALANCE_MINOR, 500))),
    rewardsMaxPointsPerRedemptionMinor: parsePositiveInt(
      envSource.REWARDS_MAX_POINTS_PER_REDEMPTION_MINOR,
      10_000,
      "REWARDS_MAX_POINTS_PER_REDEMPTION_MINOR"
    ),
    rewardsCooldownHoursBetweenRedemptions: Math.max(
      0,
      parseNumber(envSource.REWARDS_COOLDOWN_HOURS_BETWEEN_REDEMPTIONS, 24)
    ),
    rewardsMinOrderAmountRemainingMinor: parsePositiveInt(
      envSource.REWARDS_MIN_ORDER_AMOUNT_REMAINING_MINOR,
      50,
      "REWARDS_MIN_ORDER_AMOUNT_REMAINING_MINOR"
    ),
    rewardsMaxCheckoutDiscountBps: parseFeeBpsBound(
      envSource.REWARDS_MAX_CHECKOUT_DISCOUNT_BPS,
      5000,
      "REWARDS_MAX_CHECKOUT_DISCOUNT_BPS"
    ),
    rewardsPointsPerFiatMinorUnit: parsePositiveInt(
      envSource.REWARDS_POINTS_PER_FIAT_MINOR_UNIT,
      100,
      "REWARDS_POINTS_PER_FIAT_MINOR_UNIT"
    ),
    rewardsCurrencyCode: (() => {
      const s = String(envSource.REWARDS_CURRENCY_CODE || "DEEN_PTS").trim();
      if (s.length >= 3 && s.length <= 32) {
        return s;
      }
      return "DEEN_PTS";
    })(),
    rewardsPointsDecimals: (() => {
      const v = Math.round(parseNumber(envSource.REWARDS_POINTS_DECIMALS, 0));
      return [0, 2, 3].includes(v) ? v : 0;
    })(),
    rewardsMaxEarnPerUserPerDayMinor: Math.max(
      1,
      Math.round(parseNumber(envSource.REWARDS_MAX_EARN_PER_USER_PER_DAY_MINOR, 5000))
    ),
    rewardsMaxEarnPerUserPerMonthMinor: Math.max(
      1,
      Math.round(parseNumber(envSource.REWARDS_MAX_EARN_PER_USER_PER_MONTH_MINOR, 50_000))
    ),
    rewardsMaxSingleGrantMinor: Math.max(1, Math.round(parseNumber(envSource.REWARDS_MAX_SINGLE_GRANT_MINOR, 2000))),
    rewardsMinGrantMinor: Math.max(1, Math.round(parseNumber(envSource.REWARDS_MIN_GRANT_MINOR, 1))),
    rewardsRulesMaxGrantsPerRollingHour: parsePositiveInt(
      envSource.REWARDS_RULES_MAX_GRANTS_PER_ROLLING_HOUR,
      40,
      "REWARDS_RULES_MAX_GRANTS_PER_ROLLING_HOUR"
    ),
    rewardsRulesMinSecondsBetweenGrantsSameTarget: Math.max(
      0,
      Math.round(parseNumber(envSource.REWARDS_RULES_MIN_SECONDS_BETWEEN_GRANTS_SAME_TARGET, 45))
    ),
    rewardsRulesMinQualityForEngagementEarn: (() => {
      const v = parseNumber(envSource.REWARDS_RULES_MIN_QUALITY_FOR_ENGAGEMENT_EARN, 0.55);
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        return 0.55;
      }
      return v;
    })(),
    rewardsRulesMinDwellSecondsForReaction: Math.max(
      0,
      Math.min(3600, Math.round(parseNumber(envSource.REWARDS_RULES_MIN_DWELL_SECONDS_FOR_REACTION, 3)))
    ),
    rewardsReversalFullRefundClawbackRatio: (() => {
      const v = parseNumber(envSource.REWARDS_REVERSAL_FULL_REFUND_CLAWBACK_RATIO, 1);
      return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
    })(),
    rewardsReversalPartialRefundClawbackRatio: (() => {
      const v = parseNumber(envSource.REWARDS_REVERSAL_PARTIAL_REFUND_CLAWBACK_RATIO, 0.5);
      return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.5;
    })(),
    rewardsReversalChargebackClawbackRatio: (() => {
      const v = parseNumber(envSource.REWARDS_REVERSAL_CHARGEBACK_CLAWBACK_RATIO, 1);
      return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
    })(),
    rewardsReversalMaxAgeDays: parsePositiveInt(envSource.REWARDS_REVERSAL_MAX_AGE_DAYS, 120, "REWARDS_REVERSAL_MAX_AGE_DAYS"),
    rewardsFraudThresholds: {
      redemptionVelocityWindowHours: (() => {
        const n = parsePositiveInt(
          envSource.REWARDS_FRAUD_REDEMPTION_VELOCITY_WINDOW_HOURS,
          24,
          "REWARDS_FRAUD_REDEMPTION_VELOCITY_WINDOW_HOURS"
        );
        return Math.min(168, n);
      })(),
      redemptionVelocityMinCount: (() => {
        const n = parsePositiveInt(
          envSource.REWARDS_FRAUD_REDEMPTION_VELOCITY_MIN_COUNT,
          4,
          "REWARDS_FRAUD_REDEMPTION_VELOCITY_MIN_COUNT"
        );
        return Math.min(100, Math.max(2, n));
      })(),
      reversalBurstWindowDays: (() => {
        const n = parsePositiveInt(
          envSource.REWARDS_FRAUD_REVERSAL_BURST_WINDOW_DAYS,
          7,
          "REWARDS_FRAUD_REVERSAL_BURST_WINDOW_DAYS"
        );
        return Math.min(90, n);
      })(),
      reversalBurstMinCount: (() => {
        const n = parsePositiveInt(
          envSource.REWARDS_FRAUD_REVERSAL_BURST_MIN_COUNT,
          3,
          "REWARDS_FRAUD_REVERSAL_BURST_MIN_COUNT"
        );
        return Math.min(50, Math.max(2, n));
      })(),
      referralQualifiedVelocityWindowHours: (() => {
        const n = parsePositiveInt(
          envSource.REWARDS_FRAUD_REFERRAL_QUALIFIED_VELOCITY_WINDOW_HOURS,
          24,
          "REWARDS_FRAUD_REFERRAL_QUALIFIED_VELOCITY_WINDOW_HOURS"
        );
        return Math.min(168, n);
      })(),
      referralQualifiedVelocityMinCount: (() => {
        const n = parsePositiveInt(
          envSource.REWARDS_FRAUD_REFERRAL_QUALIFIED_VELOCITY_MIN_COUNT,
          8,
          "REWARDS_FRAUD_REFERRAL_QUALIFIED_VELOCITY_MIN_COUNT"
        );
        return Math.min(200, Math.max(2, n));
      })(),
      voidedAttributionWindowDays: (() => {
        const n = parsePositiveInt(
          envSource.REWARDS_FRAUD_VOIDED_ATTRIBUTION_WINDOW_DAYS,
          7,
          "REWARDS_FRAUD_VOIDED_ATTRIBUTION_WINDOW_DAYS"
        );
        return Math.min(90, n);
      })(),
      voidedAttributionListLimit: (() => {
        const n = parsePositiveInt(
          envSource.REWARDS_FRAUD_VOIDED_ATTRIBUTION_LIST_LIMIT,
          40,
          "REWARDS_FRAUD_VOIDED_ATTRIBUTION_LIST_LIMIT"
        );
        return Math.min(200, n);
      })()
    }
  };

  if (!VALID_DB_SSL_MODES.has(config.dbSslMode)) {
    throw new Error("DB_SSL_MODE must be disable, require, or no-verify");
  }
  if (!new Set(["read", "create", "chat", "growth", "full"]).has(config.rolloutStage)) {
    throw new Error("ROLLOUT_STAGE must be read, create, chat, growth, or full");
  }
  if (config.monetizationPlatformFeeBpsMin > config.monetizationPlatformFeeBpsMax) {
    throw new Error("MONETIZATION_PLATFORM_FEE_BPS_MIN must be <= MONETIZATION_PLATFORM_FEE_BPS_MAX");
  }
  if (
    config.monetizationPlatformFeeBps < config.monetizationPlatformFeeBpsMin ||
    config.monetizationPlatformFeeBps > config.monetizationPlatformFeeBpsMax
  ) {
    throw new Error(
      "MONETIZATION_PLATFORM_FEE_BPS must be between MONETIZATION_PLATFORM_FEE_BPS_MIN and MONETIZATION_PLATFORM_FEE_BPS_MAX"
    );
  }

  if (!VALID_MEDIA_PROVIDERS.has(config.mediaProvider)) {
    throw new Error("MEDIA_PROVIDER must be mock or s3");
  }
  if (config.mediaProvider === "s3") {
    if (!config.awsRegion) {
      throw new Error("AWS_REGION is required when MEDIA_PROVIDER=s3");
    }
    if (!config.awsS3Bucket) {
      throw new Error("AWS_S3_BUCKET is required when MEDIA_PROVIDER=s3");
    }
  }

  if (config.isProduction && !config.databaseUrl) {
    throw new Error("DATABASE_URL is required in production");
  }

  if (config.isProduction) {
    if (!config.jwtAccessSecret) {
      throw new Error("JWT_ACCESS_SECRET is required in production");
    }
    if (!config.jwtRefreshSecret) {
      throw new Error("JWT_REFRESH_SECRET is required in production");
    }
    if (!config.adminOwnerEmail) {
      throw new Error("ADMIN_OWNER_EMAIL is required in production");
    }
    if (!config.appBaseUrl) {
      throw new Error(
        "APP_BASE_URL is required in production (or provide MEDIA_PUBLIC_BASE_URL/CORS_ORIGINS)"
      );
    }
    if (config.stripeSecretKey && !config.stripeWebhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is provided");
    }
    if (config.stripeWebhookSecret && !config.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is required when STRIPE_WEBHOOK_SECRET is provided");
    }
  }

  assertFeedRankModifierGuardrails(config);

  return config;
}

module.exports = {
  loadEnv
};
