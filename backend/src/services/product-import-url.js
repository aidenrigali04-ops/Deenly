const dns = require("dns").promises;
const net = require("net");
const { URL } = require("url");
const { httpError } = require("../utils/http-error");

const MAX_HTML_BYTES = 800_000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 12_000;
const BLOCKED_HOSTNAMES = new Set(["localhost"]);

function isRestrictedIpv4Parts(o1, o2) {
  if (o1 === 0 || o1 === 127 || o1 >= 224) {
    return true;
  }
  if (o1 === 10) {
    return true;
  }
  if (o1 === 172 && o2 >= 16 && o2 <= 31) {
    return true;
  }
  if (o1 === 192 && o2 === 168) {
    return true;
  }
  if (o1 === 169 && o2 === 254) {
    return true;
  }
  if (o1 === 100 && o2 >= 64 && o2 <= 127) {
    return true;
  }
  return false;
}

function isRestrictedIp(ip) {
  if (!ip || typeof ip !== "string") {
    return true;
  }
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map((x) => Number(x));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return true;
    }
    return isRestrictedIpv4Parts(parts[0], parts[1]);
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
      return true;
    }
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.slice(7);
      if (net.isIPv4(v4)) {
        return isRestrictedIp(v4);
      }
    }
    return false;
  }
  return true;
}

async function resolveAllAddresses(hostname) {
  const out = new Set();
  try {
    for (const ip of await dns.resolve4(hostname)) {
      out.add(ip);
    }
  } catch {
    // ignore
  }
  try {
    for (const ip of await dns.resolve6(hostname)) {
      out.add(ip);
    }
  } catch {
    // ignore
  }
  return [...out];
}

async function assertUrlSafeForFetch(url) {
  if (url.protocol !== "https:") {
    throw httpError(400, "Only https URLs are allowed");
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    throw httpError(400, "URL host is not allowed");
  }
  const ips = await resolveAllAddresses(hostname);
  if (ips.length === 0) {
    throw httpError(400, "Could not resolve URL host");
  }
  for (const ip of ips) {
    if (isRestrictedIp(ip)) {
      throw httpError(400, "URL resolves to a disallowed network address");
    }
  }
}

function extractMetaContent(html, property) {
  const esc = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta[^>]+property=["']${esc}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  if (m) {
    return m[1].trim();
  }
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*property=["']${esc}["'][^>]*>`,
    "i"
  );
  const m2 = html.match(re2);
  return m2 ? m2[1].trim() : "";
}

function walkJsonLdForProduct(node, out) {
  if (!node || typeof node !== "object") {
    return;
  }
  const type = node["@type"];
  const types = Array.isArray(type) ? type : type ? [type] : [];
  const isProduct = types.some((t) => String(t).toLowerCase() === "product");
  const isOffer = types.some((t) => String(t).toLowerCase() === "offer");

  if (isProduct) {
    if (node.name) {
      out.title = out.title || String(node.name).trim();
    }
    if (node.description) {
      out.description = out.description || String(node.description).trim();
    }
    const offers = node.offers;
    if (offers && typeof offers === "object") {
      walkJsonLdForProduct(offers, out);
    }
  }
  if (isOffer) {
    if (node.price != null && out.priceMinor == null) {
      const p = Number(node.price);
      if (Number.isFinite(p) && p > 0) {
        const cur = node.priceCurrency ? String(node.priceCurrency).trim().toLowerCase().slice(0, 3) : "usd";
        out.priceMinor = Math.round(p * 100);
        out.currency = cur;
      }
    }
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      walkJsonLdForProduct(item, out);
    }
    return;
  }
  for (const k of Object.keys(node)) {
    walkJsonLdForProduct(node[k], out);
  }
}

function parseJsonLdBlocks(html) {
  const out = { title: "", description: "", priceMinor: null, currency: "usd" };
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) {
      continue;
    }
    try {
      const data = JSON.parse(raw);
      walkJsonLdForProduct(data, out);
    } catch {
      // skip invalid JSON-LD
    }
  }
  return out;
}

function parseOpenGraph(html) {
  return {
    title: extractMetaContent(html, "og:title"),
    description: extractMetaContent(html, "og:description"),
    image: extractMetaContent(html, "og:image")
  };
}

function parseProductHtml(html, sourceUrl) {
  const ld = parseJsonLdBlocks(html);
  const og = parseOpenGraph(html);

  const title = (ld.title || og.title || "").trim().slice(0, 180);
  const description = (ld.description || og.description || "").trim().slice(0, 2000) || null;

  let priceMinor = ld.priceMinor;
  let currency = ld.currency || "usd";
  const hadLdPrice = ld.priceMinor != null && Number.isInteger(ld.priceMinor) && ld.priceMinor > 0;
  if (!hadLdPrice) {
    priceMinor = 100;
    currency = "usd";
  }

  let confidence = "low";
  if (ld.title) {
    confidence = hadLdPrice ? "high" : "medium";
  } else if (og.title) {
    confidence = "medium";
  }

  const warnings = [];
  if (confidence === "low") {
    warnings.push("Could not find much structured data; please review all fields.");
  }
  if (!hadLdPrice) {
    warnings.push("Price was not detected reliably; default minimum placeholder — update before publishing.");
  }

  return {
    draft: {
      title: title || "Imported product",
      description,
      priceMinor,
      currency,
      productType: "service",
      websiteUrl: sourceUrl
    },
    confidence,
    warnings,
    hints: {
      ogImage: og.image || null
    }
  };
}

async function fetchHtmlSafe(initialUrlString) {
  let nextUrl;
  try {
    nextUrl = new URL(initialUrlString);
  } catch {
    throw httpError(400, "Invalid URL");
  }

  let lastUrl = nextUrl;
  let redirectsFollowed = 0;
  for (;;) {
    await assertUrlSafeForFetch(nextUrl);
    lastUrl = nextUrl;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(nextUrl.toString(), {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "DeenlyProductImport/1.0",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
        },
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(t);
      if (e?.name === "AbortError") {
        throw httpError(422, "Timed out fetching URL");
      }
      throw httpError(422, "Could not fetch URL");
    }
    clearTimeout(t);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || redirectsFollowed >= MAX_REDIRECTS) {
        throw httpError(422, "Too many redirects or missing Location header");
      }
      redirectsFollowed += 1;
      nextUrl = new URL(loc, lastUrl);
      continue;
    }

    if (!res.ok) {
      throw httpError(422, `URL returned HTTP ${res.status}`);
    }

    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (ct && ct !== "text/html" && ct !== "application/xhtml+xml") {
      throw httpError(422, "URL did not return HTML");
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw httpError(422, "Empty response body");
    }
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        total += value.length;
        if (total > MAX_HTML_BYTES) {
          reader.cancel().catch(() => {});
          throw httpError(422, "Response too large");
        }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks);
    return { html: buf.toString("utf8", 0, Math.min(buf.length, MAX_HTML_BYTES)), finalUrl: lastUrl.toString() };
  }
}

async function importProductDraftFromUrl(urlString) {
  const { html, finalUrl } = await fetchHtmlSafe(urlString);
  const parsed = parseProductHtml(html, finalUrl);
  return {
    ...parsed,
    sourceUrl: finalUrl
  };
}

module.exports = {
  importProductDraftFromUrl,
  parseProductHtml,
  isRestrictedIp,
  assertUrlSafeForFetch
};
