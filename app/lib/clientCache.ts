"use client";

type CacheEnvelope<T> = {
  ts: number;
  data: T;
};

export function getClientCache<T>(key: string, maxAgeMs: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > maxAgeMs) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function setClientCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CacheEnvelope<T> = {
      ts: Date.now(),
      data,
    };
    window.sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // no-op
  }
}

