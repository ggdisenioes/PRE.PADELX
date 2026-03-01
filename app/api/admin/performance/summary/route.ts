import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type MetricRow = {
  metric_type: "web_vital" | "api_timing";
  path: string;
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor" | null;
  method: string | null;
  status_code: number | null;
  created_at: string;
  tenant_id: string | null;
};

type GroupSummary = {
  key: string;
  path: string;
  name: string;
  method: string | null;
  samples: number;
  avg: number;
  p50: number;
  p95: number;
  poorRate: number;
  status5xxRate?: number;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  const weight = index - low;
  return sorted[low] + (sorted[high] - sorted[low]) * weight;
}

function round(value: number, digits = 1): number {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

export async function GET(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Servidor mal configurado" }, { status: 500 });
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile } = await authClient
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "manager", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const url = new URL(req.url);
    const hours = Math.min(Math.max(Number(url.searchParams.get("hours") || 24), 1), 168);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let query = adminClient
      .from("performance_events")
      .select("metric_type, path, name, value, rating, method, status_code, created_at, tenant_id")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(6000);

    if (profile.role !== "super_admin") {
      query = query.eq("tenant_id", profile.tenant_id);
    } else {
      const tenantId = url.searchParams.get("tenant_id");
      if (tenantId) query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []) as MetricRow[];

    const webGroups = new Map<string, GroupSummary & { values: number[]; poor: number }>();
    const apiGroups = new Map<
      string,
      GroupSummary & { values: number[]; poor: number; status5xx: number }
    >();

    for (const row of rows) {
      if (!Number.isFinite(Number(row.value))) continue;

      const value = Number(row.value);
      if (row.metric_type === "web_vital") {
        const key = `${row.path}__${row.name}`;
        if (!webGroups.has(key)) {
          webGroups.set(key, {
            key,
            path: row.path,
            name: row.name,
            method: null,
            samples: 0,
            avg: 0,
            p50: 0,
            p95: 0,
            poorRate: 0,
            values: [],
            poor: 0,
          });
        }
        const g = webGroups.get(key)!;
        g.samples += 1;
        g.values.push(value);
        if (row.rating === "poor") g.poor += 1;
      } else if (row.metric_type === "api_timing") {
        const key = `${row.path}__${row.method || "GET"}`;
        if (!apiGroups.has(key)) {
          apiGroups.set(key, {
            key,
            path: row.path,
            name: row.name,
            method: row.method || "GET",
            samples: 0,
            avg: 0,
            p50: 0,
            p95: 0,
            poorRate: 0,
            status5xxRate: 0,
            values: [],
            poor: 0,
            status5xx: 0,
          });
        }
        const g = apiGroups.get(key)!;
        g.samples += 1;
        g.values.push(value);
        if (row.rating === "poor") g.poor += 1;
        if ((row.status_code || 0) >= 500) g.status5xx += 1;
      }
    }

    const webVitals = Array.from(webGroups.values())
      .map((g) => {
        const sum = g.values.reduce((acc, n) => acc + n, 0);
        return {
          key: g.key,
          path: g.path,
          name: g.name,
          method: null,
          samples: g.samples,
          avg: round(sum / Math.max(g.samples, 1)),
          p50: round(percentile(g.values, 0.5)),
          p95: round(percentile(g.values, 0.95)),
          poorRate: round((g.poor / Math.max(g.samples, 1)) * 100, 2),
        };
      })
      .sort((a, b) => b.samples - a.samples);

    const apiTimings = Array.from(apiGroups.values())
      .map((g) => {
        const sum = g.values.reduce((acc, n) => acc + n, 0);
        return {
          key: g.key,
          path: g.path,
          name: g.name,
          method: g.method,
          samples: g.samples,
          avg: round(sum / Math.max(g.samples, 1)),
          p50: round(percentile(g.values, 0.5)),
          p95: round(percentile(g.values, 0.95)),
          poorRate: round((g.poor / Math.max(g.samples, 1)) * 100, 2),
          status5xxRate: round((g.status5xx / Math.max(g.samples, 1)) * 100, 2),
        };
      })
      .sort((a, b) => b.p95 - a.p95);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      hours,
      totalSamples: rows.length,
      webVitals,
      apiTimings,
    });
  } catch (error) {
    console.error("PERFORMANCE SUMMARY ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
