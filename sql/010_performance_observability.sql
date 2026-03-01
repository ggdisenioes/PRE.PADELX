-- Performance observability
-- Captures Web Vitals and API timings for operational tuning.

CREATE TABLE IF NOT EXISTS public.performance_events (
  id BIGSERIAL PRIMARY KEY,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('web_vital', 'api_timing')),
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  rating TEXT CHECK (rating IN ('good', 'needs-improvement', 'poor')),
  method TEXT,
  status_code INTEGER,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sample_rate DOUBLE PRECISION,
  user_agent TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_events_created_at
  ON public.performance_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_performance_events_type_path_name
  ON public.performance_events (metric_type, path, name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_performance_events_tenant_created_at
  ON public.performance_events (tenant_id, created_at DESC);

ALTER TABLE public.performance_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY perf_events_admin_read ON public.performance_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager', 'super_admin')
        AND (
          p.role = 'super_admin'
          OR p.tenant_id = performance_events.tenant_id
        )
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
