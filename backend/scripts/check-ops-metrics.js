const https = require("https");

const metricsUrl = String(process.env.OPS_METRICS_URL || "").trim();
const rawAuthToken = String(process.env.OPS_METRICS_BEARER_TOKEN || "").trim();
const authToken = rawAuthToken.replace(/^Bearer\s+/i, "").trim();
const strict = String(process.env.OPS_METRICS_STRICT || "").toLowerCase() === "true";
const minApiRequests = Number.parseInt(
  String(process.env.OPS_METRICS_MIN_API_REQUESTS || "0"),
  10
);

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
        const hasApiMetric = Object.prototype.hasOwnProperty.call(
          payload || {},
          "apiRequestErrorRate"
        );
        const apiTotal = Number(payload?.apiTotalRequests || 0);
        const errorRate = hasApiMetric
          ? Number(payload.apiRequestErrorRate)
          : Number(payload?.requestErrorRate || 0);
        const p95 = payload?.p95Ms || 0;

        const skipErrorRateCheck =
          hasApiMetric &&
          Number.isFinite(minApiRequests) &&
          minApiRequests > 0 &&
          apiTotal < minApiRequests;

        if (skipErrorRateCheck) {
          console.log(
            `Ops metrics: skipping API error rate check (apiTotalRequests=${apiTotal} < OPS_METRICS_MIN_API_REQUESTS=${minApiRequests}).`
          );
        } else if (errorRate > 0.02) {
          const detail = {
            errorRateChecked: hasApiMetric ? "apiRequestErrorRate" : "requestErrorRate",
            errorRate,
            totalRequests: payload?.totalRequests,
            totalErrors: payload?.totalErrors,
            apiTotalRequests: payload?.apiTotalRequests,
            apiTotalErrors: payload?.apiTotalErrors,
            statusCounts: payload?.statusCounts
          };
          console.error(`Error rate too high: ${errorRate}`);
          console.error(`Ops metrics detail: ${JSON.stringify(detail)}`);
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
