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
function attachAiClientError(err, statusCode, publicMessage) {
  err.statusCode = statusCode;
  err.publicMessage = publicMessage;
  return err;
}

async function completeOpenAiChat({
  apiKey,
  model,
  messages,
  maxTokens = 600,
  timeoutMs = 55000,
  logger
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(OPENAI_URL, {
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
    } catch (fetchErr) {
      const name = fetchErr?.name || "";
      const msg = String(fetchErr?.message || "");
      if (name === "AbortError" || /aborted/i.test(msg)) {
        const err = new Error("OpenAI request aborted (timeout)");
        throw attachAiClientError(
          err,
          504,
          "AI overview timed out. Try again in a moment."
        );
      }
      logger?.warn?.({ err: fetchErr }, "openai_chat_fetch_failed");
      const err = new Error("OpenAI fetch failed");
      throw attachAiClientError(
        err,
        502,
        "Could not reach the AI service. Check your network or try again later."
      );
    }

    const raw = await res.text();
    if (!res.ok) {
      logger?.warn?.({ status: res.status, bodyPreview: raw.slice(0, 200) }, "openai_chat_error");
      const err = new Error(`OpenAI HTTP ${res.status}`);
      if (res.status === 401) {
        throw attachAiClientError(
          err,
          503,
          "AI is not configured correctly on the server (invalid API key)."
        );
      }
      if (res.status === 429) {
        throw attachAiClientError(err, 503, "AI rate limit reached. Try again in a few minutes.");
      }
      if (res.status >= 500) {
        throw attachAiClientError(
          err,
          502,
          "AI provider error. Please try again later."
        );
      }
      throw attachAiClientError(
        err,
        502,
        "AI could not process this request. Check the product listing or try again."
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const err = new Error("Invalid OpenAI response");
      throw attachAiClientError(
        err,
        502,
        "AI returned an unexpected response. Try again later."
      );
    }
    const text = parsed?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      const err = new Error("Empty OpenAI completion");
      throw attachAiClientError(
        err,
        502,
        "AI returned an empty summary. Try again or edit the product details."
      );
    }
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  completeOpenAiChat
};
