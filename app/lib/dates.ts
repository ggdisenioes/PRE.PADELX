/**
 * Parsea un timestamp de Supabase forzando interpretación UTC.
 * PostgREST devuelve timestamps sin sufijo de zona horaria (ej: "2026-02-14T13:00:00"),
 * y JavaScript los interpreta como hora LOCAL en vez de UTC.
 * Esta función agrega "Z" si falta, para que siempre se interprete como UTC.
 */
export function parseUTC(ts: string | null | undefined): Date | null {
  if (!ts) return null;
  // Si ya tiene info de timezone (+00:00, Z, etc.), no tocar
  if (ts.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(ts)) {
    return new Date(ts);
  }
  return new Date(ts + "Z");
}

/** Formatea hora en zona Europe/Madrid. Ej: "14:00" */
export function formatTimeMadrid(ts: string | null | undefined): string {
  const d = parseUTC(ts);
  if (!d) return "—";
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
}

/** Formatea fecha en zona Europe/Madrid. Ej: "14/02/2026" */
export function formatDateMadrid(ts: string | null | undefined): string {
  const d = parseUTC(ts);
  if (!d) return "—";
  return d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
}

/** Formatea fecha + hora en zona Europe/Madrid. Ej: "14/2/2026, 14:00:00" */
export function formatDateTimeMadrid(ts: string | null | undefined): string {
  const d = parseUTC(ts);
  if (!d) return "—";
  return d.toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
}
