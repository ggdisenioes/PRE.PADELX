import fs from "node:fs";

const baseUrl = (process.env.GO_LIVE_BASE_URL || "https://twinco.padelx.es").replace(/\/+$/, "");
const endpoint = `${baseUrl}/api/health`;
const attempts = Number(process.env.HEALTH_ATTEMPTS || 3);
const timeoutMs = Number(process.env.HEALTH_TIMEOUT_MS || 15000);
const reportPath = process.env.HEALTH_REPORT_PATH || "health-report.json";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkOnce() {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        "user-agent": "padelx-health-monitor/1.0",
        accept: "application/json",
      },
      signal: controller.signal,
    });

    const text = await res.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {}

    const durationMs = Date.now() - startedAt;
    const ok =
      res.status === 200 &&
      payload &&
      payload.ok === true &&
      payload.status === "healthy" &&
      payload.checks?.database === true;

    return {
      ok,
      status: res.status,
      duration_ms: durationMs,
      payload,
      body_preview: text.slice(0, 250),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      duration_ms: Date.now() - startedAt,
      payload: null,
      body_preview: "",
      error: String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const results = [];
  let pass = false;

  for (let i = 1; i <= attempts; i += 1) {
    const result = await checkOnce();
    results.push({ attempt: i, ...result });
    if (result.ok) {
      pass = true;
      break;
    }
    if (i < attempts) await sleep(2500);
  }

  const report = {
    endpoint,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    pass,
    attempts,
    results,
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const last = results[results.length - 1];
  if (!pass) {
    console.error(
      `FAIL health monitor: status=${last.status} duration=${last.duration_ms}ms error=${last.error || "none"}`
    );
    process.exit(1);
  }

  console.log(`OK health monitor: status=${last.status} duration=${last.duration_ms}ms`);
}

main();
