import { createClient } from "@supabase/supabase-js";

// IMPORTANT:
// - No rompemos el build si faltan env vars (Vercel/Next puede evaluar módulos en build).
// - En runtime real, estas vars deben estar configuradas, pero usamos fallback para evitar
//   errores tipo "supabaseUrl is required" durante prerender.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "public-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
