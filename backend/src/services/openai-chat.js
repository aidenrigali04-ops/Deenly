const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/**
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} options.model
 * @param {Array<{ role: string; content: string }>} options.messages
 * @param {number} [options.maxTokens]
 * @param {number} [options.timeoutMs]
 * @param {import("pino").Logger} [options.logger]
 */
async function completeOpenAiChat({
  apiKey,
  model,
  messages,
  maxTokens = 600,
  timeoutMs = 25000,
  logger
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.5
      }),
      signal: controller.signal
    });
    const raw = await res.text();
    if (!res.ok) {
      logger?.warn?.({ status: res.status, bodyPreview: raw.slice(0, 200) }, "openai_chat_error");
      const err = new Error("OpenAI request failed");
      err.statusCode = res.status >= 500 ? 502 : 400;
      throw err;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const err = new Error("Invalid OpenAI response");
      err.statusCode = 502;
      throw err;
    }
    const text = parsed?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      const err = new Error("Empty OpenAI completion");
      err.statusCode = 502;
      throw err;
    }
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  completeOpenAiChat
};
