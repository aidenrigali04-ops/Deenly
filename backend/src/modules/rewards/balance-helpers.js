/**
 * Pure helpers for reward point math (ledger rows use bigint / string from pg).
 */

function toBigInt(value) {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  const s = String(value ?? "0").trim();
  if (!s) {
    return 0n;
  }
  return BigInt(s);
}

function sumDeltaPointsFromRows(rows) {
  let total = 0n;
  for (const row of rows || []) {
    total += toBigInt(row.delta_points);
  }
  return total;
}

function encodeHistoryCursor(createdAtIso, id) {
  const payload = JSON.stringify({ t: createdAtIso, i: id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeHistoryCursor(cursor) {
  if (!cursor || typeof cursor !== "string") {
    return null;
  }
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.t !== "string" || !Number.isFinite(Number(parsed.i))) {
      return null;
    }
    return { createdAtIso: parsed.t, id: Number(parsed.i) };
  } catch {
    return null;
  }
}

module.exports = {
  toBigInt,
  sumDeltaPointsFromRows,
  encodeHistoryCursor,
  decodeHistoryCursor
};
