import "server-only";

import { createClient } from "@supabase/supabase-js";

export type PerformanceMetricType = "web_vital" | "api_timing";
export type PerformanceRating = "good" | "needs-improvement" | "poor";

type RecordPerformanceEventInput = {
  metricType: PerformanceMetricType;
  path: string;
  name: string;
  value: number;
  rating?: PerformanceRating | null;
  method?: string | null;
  statusCode?: number | null;
  tenantId?: string | null;
  userId?: string | null;
  sampleRate?: number;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient:
  | ReturnType<typeof createClient>
  | null = null;

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

function normalizePath(path: string) {
  if (!path) return "unknown";
  const trimmed = path.trim();
  if (!trimmed) return "unknown";
  return trimmed.slice(0, 250);
}

export function getWebVitalRating(
  name: string,
  value: number
): PerformanceRating {
  const metric = String(name).toUpperCase();
  const msValue = Number(value) || 0;

  switch (metric) {
    case "LCP":
      if (msValue <= 2500) return "good";
      if (msValue <= 4000) return "needs-improvement";
      return "poor";
    case "INP":
      if (msValue <= 200) return "good";
      if (msValue <= 500) return "needs-improvement";
      return "poor";
    case "CLS":
      if (msValue <= 0.1) return "good";
      if (msValue <= 0.25) return "needs-improvement";
      return "poor";
    case "FCP":
      if (msValue <= 1800) return "good";
      if (msValue <= 3000) return "needs-improvement";
      return "poor";
    case "TTFB":
      if (msValue <= 800) return "good";
      if (msValue <= 1800) return "needs-improvement";
      return "poor";
    default:
      return "needs-improvement";
  }
}

export function getApiTimingRating(durationMs: number): PerformanceRating {
  if (durationMs <= 250) return "good";
  if (durationMs <= 800) return "needs-improvement";
  return "poor";
}

export async function recordPerformanceEvent(
  input: RecordPerformanceEventInput
) {
  const sampleRate = Math.min(Math.max(input.sampleRate ?? 1, 0), 1);
  if (sampleRate < 1 && Math.random() > sampleRate) return;

  const client = getAdminClient();
  if (!client) return;

  const value = Number(input.value);
  if (!Number.isFinite(value)) return;

  try {
    await client.from("performance_events").insert({
      metric_type: input.metricType,
      path: normalizePath(input.path),
      name: String(input.name || "unknown").slice(0, 80),
      value,
      rating: input.rating ?? null,
      method: input.method ?? null,
      status_code: input.statusCode ?? null,
      tenant_id: input.tenantId ?? null,
      user_id: input.userId ?? null,
      sample_rate: sampleRate,
      user_agent: input.userAgent ?? null,
      meta: input.meta ?? {},
    });
  } catch (error) {
    // Nunca romper request principal por telemetría.
    console.error("[performance] failed to record metric:", error);
  }
}
