const express = require("express");
const rateLimit = require("express-rate-limit");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { requireString, optionalString } = require("../../utils/validators");
const { completeOpenAiChat } = require("../../services/openai-chat");

const INTENTS = new Set(["polish", "marketplace_listing", "recitation_caption"]);

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
  if (intent === "recitation_caption") {
    return (
      base +
      " Improve the user's short caption for sharing Quran recitation: warm, humble, no scholarly claims. " +
      "Same language as the user. Max about 800 characters."
    );
  }
  return (
    base +
    " Polish the user's post for clarity and respectful tone. Keep their meaning and voice. " +
    "Same language as the user. Max about 1800 characters."
  );
}

const commentSystem =
  "You help users comment respectfully on Deenly. " +
  "Offer ONE alternative comment that is calmer and kinder, same language as the user, similar length. " +
  "No religious rulings. Output only the comment text, nothing else. Max 1900 characters.";

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

  return router;
}

module.exports = {
  createAiRouter
};
