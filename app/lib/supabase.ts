import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Fail fast with a clear error instead of creating a client with placeholder values.
// Placeholder keys cause confusing runtime errors like "Invalid API key".
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    [
      "Supabase env vars missing.",
      `NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? "OK" : "MISSING"}`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? "OK" : "MISSING"}`,
      "\nFix:",
      "- Add the real values to .env.local (local dev) and restart `npm run dev`.",
      "- Add the same env vars in Vercel Project Settings → Environment Variables.",
    ].join("\n")
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});