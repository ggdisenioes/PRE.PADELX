import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function env(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Falta secret/env: ${name}`);
  return v;
}

serve(async () => {
  try {
    const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

    const { error } = await supabase.rpc("enqueue_match_reminder_24h");
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { "content-type": "application/json" },
      status: 500,
    });
  }
});