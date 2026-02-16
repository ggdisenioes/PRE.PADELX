import { supabase } from "./supabase";

/**
 * Notify players about newly created matches.
 * Non-blocking: errors are logged but don't interrupt the flow.
 */
export async function notifyMatchCreated(matchIds: number[]) {
  if (!matchIds.length) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await fetch("/api/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        type: "match_created",
        match_ids: matchIds,
      }),
    });
  } catch (err) {
    console.error("[notify] Failed to send match notifications:", err);
  }
}
