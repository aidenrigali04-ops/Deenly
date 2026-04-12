import type { FullConfig } from "@playwright/test";

function backendHealthUrl(): string {
  const raw = process.env.BACKEND_API_URL || "http://127.0.0.1:8080/api/v1";
  return new URL("/health", new URL(raw).origin).href;
}

function frontendHomeUrl(): string {
  const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3001";
  return new URL("/home", base).href;
}

async function waitForOk(
  url: string,
  opts: { timeoutMs: number; label: string }
): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
      clearTimeout(timer);
      if (res.ok) {
        return;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `E2E: ${opts.label} not ready after ${opts.timeoutMs}ms (${url}). Last error: ${lastErr}\n` +
      "Start the backend and frontend first. Example (match ports to your setup): BACKEND_API_URL=http://127.0.0.1:4000/api/v1 E2E_BASE_URL=http://127.0.0.1:3001\n" +
      "Default BACKEND_API_URL is http://127.0.0.1:8080/api/v1 — if your API listens on another port, set BACKEND_API_URL."
  );
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const timeoutMs = Number(process.env.E2E_SERVER_WAIT_MS || "120000");
  await waitForOk(backendHealthUrl(), { timeoutMs, label: "Backend /health" });
  await waitForOk(frontendHomeUrl(), { timeoutMs, label: "Frontend /home" });
}
