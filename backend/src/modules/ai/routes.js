const express = require("express");
const rateLimit = require("express-rate-limit");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { requireString, optionalString } = require("../../utils/validators");
const { completeOpenAiChat } = require("../../services/openai-chat");

const INTENTS = new Set(["polish", "marketplace_listing", "product_listing"]);

function systemPromptForIntent(intent) {
  const base =
    "You are a writing assistant for Deenly, a respectful Muslim community and marketplace app. " +
    "Do not give religious rulings, fatwas, or medical/legal advice. " +
    "Do not invent prices, guarantees, refunds, or product facts the user did not state. " +
    "Output plain text only: no markdown fences, no preamble or closing remarks.";

  if (intent === "marketplace_listing") {
    return (
      base +
      " Rewrite the user's draft as a clear marketplace post body: what it is, who it helps, and a calm call to action. " +
      "Keep the same language as the user (e.g. English if they wrote English). Max about 1800 characters."
    );
  }
  if (intent === "product_listing") {
    return (
      base +
      " Rewrite the user's draft as a clear product description: what the buyer gets, who it is for, and what to do next. " +
      "Keep the same language as the user. Max about 1800 characters."
    );
  }
  return (
    base +
    " Polish the user's post for clarity and respectful tone. Keep their meaning and voice. " +
    "Same language as the user. Max about 1800 characters."
  );
}

const productOverviewSystem =
  "You summarize a creator product for shoppers on Deenly. " +
  "Use ONLY the facts given in PRODUCT FACTS. Do not invent price, delivery, refunds, guarantees, or features not stated. " +
  "No religious rulings or legal/medical advice. Plain text, 2–4 short paragraphs, warm and clear. Max about 900 characters.";

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
        maxTokens: 700,
        logger
      });

      const clipped = suggestion.length > 2000 ? `${suggestion.slice(0, 1997).trimEnd()}…` : suggestion;
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
        maxTokens: 500,
        logger
      });
      const clipped = summary.length > 1200 ? `${summary.slice(0, 1197).trimEnd()}…` : summary;
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
