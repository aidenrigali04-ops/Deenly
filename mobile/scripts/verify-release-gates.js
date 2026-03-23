const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const easPath = path.join(__dirname, "..", "eas.json");
if (!fs.existsSync(easPath)) {
  fail("mobile/eas.json is required");
}

const eas = JSON.parse(fs.readFileSync(easPath, "utf8"));
if (!eas.build?.preview?.ios || !eas.build?.preview?.android) {
  fail("eas preview profile must include ios and android settings");
}
if (!eas.build?.production?.ios || !eas.build?.production?.android) {
  fail("eas production profile must include ios and android settings");
}

const releaseChecklistPath = path.join(__dirname, "..", "..", "backend", "RELEASE_CHECKLIST.md");
if (!fs.existsSync(releaseChecklistPath)) {
  fail("backend/RELEASE_CHECKLIST.md is required for parity");
}

const hardeningReportPath = path.join(
  __dirname,
  "..",
  "..",
  "backend",
  "LAUNCH_HARDENING_REPORT.md"
);
if (!fs.existsSync(hardeningReportPath)) {
  fail("backend/LAUNCH_HARDENING_REPORT.md is required for parity");
}

console.log("verify-release-gates passed");
