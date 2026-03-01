"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { supabase } from "@/lib/supabase";

type WebVitalMetric = {
  id: string;
  name: string;
  value: number;
  delta: number;
  rating?: "good" | "needs-improvement" | "poor";
  navigationType?: string;
};

const SAMPLE_RATE = 0.35;

export default function WebVitalsReporter() {
  const pathname = usePathname();
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const syncSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      accessTokenRef.current = session?.access_token ?? null;
    };

    syncSession();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });

    return () => {
      active = false;
      authSub.subscription.unsubscribe();
    };
  }, []);

  useReportWebVitals((metric: WebVitalMetric) => {
    if (Math.random() > SAMPLE_RATE) return;

    const body = JSON.stringify({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigationType: metric.navigationType,
      path: pathname,
      sampleRate: SAMPLE_RATE,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (accessTokenRef.current) {
      headers.Authorization = `Bearer ${accessTokenRef.current}`;
    }

    void fetch("/api/monitoring/web-vitals", {
      method: "POST",
      headers,
      body,
      keepalive: true,
      cache: "no-store",
    }).catch(() => {});
  });

  return null;
}
