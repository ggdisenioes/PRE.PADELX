import { createClient } from "@supabase/supabase-js";
import { getRoleCredentials, Role } from "./env";

const tokenCache = new Map<Role, string>();

export async function getRoleAccessToken(role: Role) {
  const cached = tokenCache.get(role);
  if (cached) return cached;

  const credentials = getRoleCredentials(role);
  if (!credentials) {
    throw new Error(`Missing E2E credentials for role: ${role}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error || !data.session?.access_token) {
    throw new Error(
      `Could not get access token for ${role}: ${error?.message || "unknown error"}`
    );
  }

  tokenCache.set(role, data.session.access_token);
  return data.session.access_token;
}
