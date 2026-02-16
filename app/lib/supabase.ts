import { createClient } from "@supabase/supabase-js";

// IMPORTANT:
// - No rompemos el build si faltan env vars (Vercel/Next puede evaluar módulos en build).
// - En runtime real, estas vars deben estar configuradas.
// - Usamos un placeholder válido para evitar errores de "supabaseUrl is required" durante prerender.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
