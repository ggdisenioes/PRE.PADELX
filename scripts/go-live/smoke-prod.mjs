import https from "node:https";
import http from "node:http";
import { URL } from "node:url";

const base = process.env.GO_LIVE_BASE_URL || "https://twinco.padelx.es";
const checks = ["/", "/login", "/api/health"];

function requestJsonOrText(url) {
  const lib = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": "padelx-go-live-smoke/1.0",
          accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode || 0,
            body,
          });
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(15_000, () => req.destroy(new Error("Request timeout")));
    req.end();
  });
}

async function run() {
  let failed = false;

  for (const path of checks) {
    const url = new URL(path, base);
    try {
      const { status, body } = await requestJsonOrText(url);
      const ok = status >= 200 && status < 400;
      const preview = body.slice(0, 120).replace(/\s+/g, " ").trim();
      console.log(`${ok ? "OK" : "FAIL"}\t${url.toString()}\t${status}\t${preview}`);
      if (!ok) failed = true;
    } catch (error) {
      failed = true;
      console.error(`FAIL\t${url.toString()}\tERR\t${String(error)}`);
    }
  }

  if (failed) process.exit(1);
}

run();
