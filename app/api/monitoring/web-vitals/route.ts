export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { recordPerformanceEvent, getWebVitalRating, type PerformanceRating } from "@/lib/performance";

const ALLOWED_METRICS = new Set(["CLS", "FCP", "FID", "INP", "LCP", "TTFB"]);

type WebVitalPayload = {
  id?: string;
  name?: string;
  value?: number;
  delta?: number;
  rating?: PerformanceRating;
  path?: string;
  navigationType?: string;
  sampleRate?: number;
};

type JwtPayload = {
  sub?: string;
  tenant_id?: string;
  user_tenant_id?: string;
  app_metadata?: {
    tenant_id?: string;
  };
  user_metadata?: {
    tenant_id?: string;
  };
};

function parseJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4 || 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

function sanitizePath(input: string | undefined, fallback: string): string {
  const source = (input || fallback || "unknown").trim();
  if (!source) return "unknown";
  if (!source.startsWith("/")) return `/${source}`.slice(0, 250);
  return source.slice(0, 250);
}

async function parseBody(req: Request): Promise<WebVitalPayload | null> {
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      return (await req.json()) as WebVitalPayload;
    }
    const raw = await req.text();
    if (!raw) return null;
    return JSON.parse(raw) as WebVitalPayload;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const payload = await parseBody(req);
  if (!payload) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const name = String(payload.name || "").toUpperCase();
  const value = Number(payload.value);
  if (!ALLOWED_METRICS.has(name) || !Number.isFinite(value)) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch?.[1] || "";
  const claims = token ? parseJwtPayload(token) : null;

  const userId = claims?.sub ?? null;
  const tenantId =
    claims?.tenant_id ??
    claims?.user_tenant_id ??
    claims?.app_metadata?.tenant_id ??
    claims?.user_metadata?.tenant_id ??
    null;

  const referer = req.headers.get("referer") || "";
  const refererPath = (() => {
    try {
      if (!referer) return "";
      return new URL(referer).pathname;
    } catch {
      return "";
    }
  })();

  const rating = payload.rating || getWebVitalRating(name, value);

  void recordPerformanceEvent({
    metricType: "web_vital",
    path: sanitizePath(payload.path, refererPath),
    name,
    value,
    rating,
    tenantId,
    userId,
    sampleRate: Number(payload.sampleRate) || 0.35,
    userAgent: req.headers.get("user-agent"),
    meta: {
      id: payload.id || null,
      delta: Number.isFinite(Number(payload.delta)) ? Number(payload.delta) : null,
      navigationType: payload.navigationType || null,
    },
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
