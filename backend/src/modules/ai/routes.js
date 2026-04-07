const express = require("express");
const rateLimit = require("express-rate-limit");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { requireString, optionalString } = require("../../utils/validators");
const { completeOpenAiChat } = require("../../services/openai-chat");

const INTENTS = new Set([
  "polish",
  "marketplace_listing",
  "product_listing",
  "service_details_generate",
  "event_listing",
  "business_listing"
]);

const ASSIST_OUTPUT_MAX_CHARS = 380;
const PRODUCT_OVERVIEW_MAX_CHARS = 320;

/** Collapse extra newlines; trim to maxLen, preferring end at sentence boundary. */
function clipAssistText(text, maxLen) {
  let t = String(text || "")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
  if (t.length <= maxLen) {
    return t;
  }
  const cut = t.slice(0, maxLen);
  const lastSentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastSentence > Math.floor(maxLen * 0.45)) {
    return cut.slice(0, lastSentence + 1).trim();
  }
  return `${cut.trimEnd()}…`;
}

function systemPromptForIntent(intent) {
  const base =
    "You are a writing assistant for Deenly, a respectful Muslim community and marketplace app. " +
    "Do not give religious rulings, fatwas, or medical/legal advice. " +
    "Do not invent prices, guarantees, refunds, or product facts the user did not state. " +
    "Output plain text only: no markdown, no bullets, no numbered lists, no preamble or sign-off. " +
    "Tone: clear value proposition — who benefits, what they get, factual only. " +
    "No hype, urgency, scarcity, superlatives, or pushy sales language. At most one calm next step.";

  if (intent === "service_details_generate") {
    return (
      base +
      " Input: KEY POINTS about a service. " +
      "Output exactly 4 lines separated by single newlines (no other formatting). " +
      "Line 1: headline naming the offer (max 52 characters). " +
      "Line 2: who it is for (max 78 characters). " +
      "Line 3: what is included (max 78 characters). " +
      "Line 4: how delivery works plus one soft next step (max 88 characters). " +
      "Infer only from key points; do not invent credentials, timelines, or guarantees. " +
      "Total under 300 characters. Match the user's language."
    );
  }

  if (intent === "marketplace_listing") {
    return (
      base +
      " Rewrite the draft as exactly 3 lines separated by newlines. " +
      "Line 1 headline what it is (max 52 chars). Line 2 who it helps (max 78). Line 3 what is included and one calm next step (max 88). " +
      "Same language as the user. Under 220 characters total."
    );
  }
  if (intent === "product_listing") {
    return (
      base +
      " Rewrite as exactly 3 lines separated by newlines. " +
      "Line 1 headline: what the buyer gets (max 52 chars). Line 2 who it is for (max 78). Line 3 essentials + one calm next step (max 88). " +
      "Same language as the user. Under 220 characters total."
    );
  }
  if (intent === "event_listing") {
    return (
      base +
      " Rewrite notes as exactly 3 lines separated by newlines. " +
      "Line 1 event name/what it is (max 52). Line 2 audience + timing or location only if user stated (max 88). " +
      "Line 3 access or format + one calm next step e.g. RSVP (max 88). " +
      "Do not invent dates, venues, prices, or links. Same language as user. Under 260 characters total."
    );
  }
  if (intent === "business_listing") {
    return (
      base +
      " Rewrite notes as exactly 3 lines separated by newlines: headline what they offer (max 52), who it serves (max 78), " +
      "credibility or scope from notes only + one soft next step (max 88). " +
      "Do not invent hours, prices, or contact details. Same language as user. Under 220 characters total."
    );
  }
  return (
    base +
    " Polish for clarity and respectful tone in exactly 2 or 3 short lines separated by newlines (max 72 chars per line). " +
    "Keep the user's meaning and language. Under 200 characters total."
  );
}

const productOverviewSystem =
  "You summarize a creator product for shoppers on Deenly. " +
  "Use ONLY PRODUCT FACTS. Do not invent delivery, refunds, guarantees, or features not stated. " +
  "No religious rulings or legal/medical advice. Plain text, two sentences only, separated by a space. " +
  "Sentence 1: what it is and core outcome. Sentence 2: who it fits and one calm next step (e.g. see listing for details). " +
  "No hype or repeated ideas. Under 240 characters total.";

const commentSystem =
  "You help users comment respectfully on Deenly. " +
  "Offer ONE alternative comment that is calmer and kinder, same language as the user, similar length. " +
  "No religious rulings. Output only the comment text, nothing else. Max 1900 characters.";

function buildBusinessChatSystem(row, surface) {
  const lines = [
    "You answer questions about a small business listed on Deenly.",
    "Use ONLY the facts in BUSINESS CONTEXT below. If something is not listed, say you do not have that information and suggest checking the business profile or messaging through the app.",
    "Do not invent phone numbers, emails, hours, or prices. No religious rulings or legal/medical advice. Plain text, concise.",
    "",
    "BUSINESS CONTEXT:",
    `Name: ${row.name}`,
    row.category ? `Category: ${row.category}` : null,
    row.description ? `Description: ${row.description}` : null,
    row.address_display ? `Address: ${row.address_display}` : null,
    row.website_url ? `Website: ${row.website_url}` : null,
    surface ? `Surface: ${surface}` : null
  ].filter(Boolean);
  return lines.join("\n");
}

function normalizeChatMessages(raw) {
  if (!Array.isArray(raw)) {
    throw httpError(400, "messages must be an array");
  }
  if (raw.length < 1 || raw.length > 12) {
    throw httpError(400, "messages must have 1–12 entries");
  }
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") {
      throw httpError(400, "each message must be an object");
    }
    const role = String(m.role || "").trim();
    if (role !== "user" && role !== "assistant") {
      throw httpError(400, "message role must be user or assistant");
    }
    const content = requireString(m.content, "content", 1, 2000);
    out.push({ role, content });
  }
  if (out[out.length - 1].role !== "user") {
    throw httpError(400, "last message must be from user");
  }
  return out;
}

function createAiRouter({ config, db, logger }) {
  const router = express.Router();
  const authMiddleware = authenticate({
    config: config || { jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "" },
    db
  });

  const assistLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 24,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator(req) {
      return req.user?.id ? `ai:${req.user.id}` : req.ip;
    }
  });

  function ensureAiEnabled() {
    const key = String(config.openaiApiKey || "").trim();
    if (!key) {
      throw httpError(503, "Writing assist is not configured on this server");
    }
    return key;
  }

  router.post(
    "/assist/post-text",
    authMiddleware,
    assistLimiter,
    asyncHandler(async (req, res) => {
      const apiKey = ensureAiEnabled();
      const draft = requireString(req.body?.draft, "draft", 1, 4000);
      const intentRaw = optionalString(req.body?.intent, "intent", 32) || "polish";
      const intent = INTENTS.has(intentRaw) ? intentRaw : "polish";

      const suggestion = await completeOpenAiChat({
        apiKey,
        model: config.openaiModel,
        messages: [
          { role: "system", content: systemPromptForIntent(intent) },
          { role: "user", content: draft }
        ],
        maxTokens: 140,
        logger
      });

      const clipped = clipAssistText(suggestion, ASSIST_OUTPUT_MAX_CHARS);
      res.status(200).json({ suggestion: clipped, intent, disclaimer: "ai_generated" });
    })
  );

  router.post(
    "/product-overview",
    authMiddleware,
    assistLimiter,
    asyncHandler(async (req, res) => {
      const apiKey = ensureAiEnabled();
      const productId = Number(req.body?.productId);
      if (!productId) {
        throw httpError(400, "productId must be a number");
      }
      const result = await db.query(
        `SELECT id, creator_user_id, title, description, price_minor, currency, product_type,
                service_details, delivery_method, website_url, audience_target, business_category, status
         FROM creator_products
         WHERE id = $1
         LIMIT 1`,
        [productId]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "Product not found");
      }
      const row = result.rows[0];
      if (row.creator_user_id !== req.user.id && row.status !== "published") {
        throw httpError(404, "Product not found");
      }
      const priceUsd = (Number(row.price_minor) / 100).toFixed(2);
      const facts = [
        `Title: ${row.title}`,
        `Type: ${row.product_type}`,
        `Price: ${priceUsd} ${String(row.currency || "usd").toUpperCase()}`,
        row.description ? `Description: ${row.description}` : null,
        row.service_details ? `Service details: ${row.service_details}` : null,
        row.delivery_method ? `Delivery: ${row.delivery_method}` : null,
        row.website_url ? `Website: ${row.website_url}` : null,
        row.business_category ? `Category: ${row.business_category}` : null
      ]
        .filter(Boolean)
        .join("\n");

      const summary = await completeOpenAiChat({
        apiKey,
        model: config.openaiModel,
        messages: [
          { role: "system", content: productOverviewSystem },
          { role: "user", content: `PRODUCT FACTS:\n${facts}` }
        ],
        maxTokens: 100,
        timeoutMs: 60000,
        logger
      });
      const clipped = clipAssistText(summary, PRODUCT_OVERVIEW_MAX_CHARS);
      res.status(200).json({ summary: clipped, disclaimer: "ai_generated" });
    })
  );

  router.post(
    "/assist/comment-tone",
    authMiddleware,
    assistLimiter,
    asyncHandler(async (req, res) => {
      const apiKey = ensureAiEnabled();
      const draft = requireString(req.body?.draft, "draft", 1, 2000);

      const suggestion = await completeOpenAiChat({
        apiKey,
        model: config.openaiModel,
        messages: [
          { role: "system", content: commentSystem },
          { role: "user", content: draft }
        ],
        maxTokens: 400,
        logger
      });

      const clipped = suggestion.length > 2000 ? `${suggestion.slice(0, 1997).trimEnd()}…` : suggestion;
      res.status(200).json({ suggestion: clipped, disclaimer: "ai_generated" });
    })
  );

  router.post(
    "/business-chat",
    authMiddleware,
    assistLimiter,
    asyncHandler(async (req, res) => {
      const apiKey = ensureAiEnabled();
      const businessId = Number(req.body?.businessId);
      if (!businessId) {
        throw httpError(400, "businessId must be a number");
      }
      const surface = optionalString(req.body?.surface, "surface", 32);
      const messages = normalizeChatMessages(req.body?.messages);

      const bizResult = await db.query(
        `SELECT id, owner_user_id, name, description, website_url, address_display, category, visibility
         FROM business_listings
         WHERE id = $1
         LIMIT 1`,
        [businessId]
      );
      if (bizResult.rowCount === 0) {
        throw httpError(404, "Business not found");
      }
      const row = bizResult.rows[0];
      if (row.visibility !== "published" && row.owner_user_id !== req.user.id) {
        throw httpError(404, "Business not found");
      }

      const system = buildBusinessChatSystem(row, surface);
      const reply = await completeOpenAiChat({
        apiKey,
        model: config.openaiModel,
        messages: [{ role: "system", content: system }, ...messages],
        maxTokens: 500,
        logger
      });
      const clipped = reply.length > 2500 ? `${reply.slice(0, 2497).trimEnd()}…` : reply;
      res.status(200).json({ reply: clipped, disclaimer: "ai_generated" });
    })
  );

  return router;
}

module.exports = {
  createAiRouter
};
