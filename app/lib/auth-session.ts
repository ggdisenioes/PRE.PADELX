import type { Session, SupabaseClient } from "@supabase/supabase-js";

type SessionClient = Pick<SupabaseClient, "auth">;

type WaitForSessionOptions = {
  retries?: number;
  delayMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForSession(
  client: SessionClient,
  options: WaitForSessionOptions = {}
): Promise<Session | null> {
  const retries = Math.max(1, options.retries ?? 6);
  const delayMs = Math.max(50, options.delayMs ?? 200);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const {
        data: { session },
      } = await client.auth.getSession();

      if (session) return session;
    } catch (error) {
      if (attempt === retries) {
        console.error("[auth-session] getSession failed after retries", error);
      }
    }

    if (attempt < retries) {
      await sleep(delayMs);
    }
  }

  return null;
}
