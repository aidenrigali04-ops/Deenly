const https = require("https");

const metricsUrl = String(process.env.OPS_METRICS_URL || "").trim();
const rawAuthToken = String(process.env.OPS_METRICS_BEARER_TOKEN || "").trim();
const authToken = rawAuthToken.replace(/^Bearer\s+/i, "").trim();
const strict = String(process.env.OPS_METRICS_STRICT || "").toLowerCase() === "true";

if (!metricsUrl || !authToken) {
  const missing = [];
  if (!metricsUrl) missing.push("OPS_METRICS_URL");
  if (!authToken) missing.push("OPS_METRICS_BEARER_TOKEN");
  const message = `Missing ${missing.join(", ")} for ops metrics check.`;
  if (strict) {
    console.error(message);
    process.exit(1);
  }
  console.log(`${message} Skipping in non-strict mode.`);
  process.exit(0);
}

https
  .get(
    metricsUrl,
    {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    },
    (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          console.error(`Ops metrics check failed with status ${response.statusCode}`);
          process.exit(1);
        }
        const payload = JSON.parse(body);
        const errorRate = payload?.requestErrorRate || 0;
        const p95 = payload?.p95Ms || 0;
        if (errorRate > 0.02) {
          console.error(`Error rate too high: ${errorRate}`);
          process.exit(1);
        }
        if (p95 > 700) {
          console.error(`Latency too high: p95=${p95}`);
          process.exit(1);
        }
        console.log("Ops metrics check passed.");
      });
    }
  )
  .on("error", (error) => {
    console.error(`Ops metrics request failed: ${error.message}`);
    process.exit(1);
  });
