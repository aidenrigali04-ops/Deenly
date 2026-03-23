const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const gatesPath = path.resolve(__dirname, "..", "RELEASE_GATES.md");
const checklistPath = path.resolve(__dirname, "..", "RELEASE_CHECKLIST.md");

if (!fs.existsSync(gatesPath)) {
  fail("RELEASE_GATES.md is missing.");
}
if (!fs.existsSync(checklistPath)) {
  fail("RELEASE_CHECKLIST.md is missing.");
}

const gates = fs.readFileSync(gatesPath, "utf8");
const checklist = fs.readFileSync(checklistPath, "utf8");
const requiredGateMarkers = ["Internal dogfood", "Closed alpha", "Private beta", "Public soft launch"];
for (const marker of requiredGateMarkers) {
  if (!gates.includes(marker)) {
    fail(`RELEASE_GATES.md missing marker: ${marker}`);
  }
}
const requiredChecklistMarkers = ["/health", "/health/db", "/ready"];
for (const marker of requiredChecklistMarkers) {
  if (!checklist.includes(marker)) {
    fail(`RELEASE_CHECKLIST.md missing smoke-check marker: ${marker}`);
  }
}

console.log("verify-release-gates passed");
