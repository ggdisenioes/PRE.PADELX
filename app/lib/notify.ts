import { supabase } from "./supabase";

export type MatchNotificationType =
  | "match_created"
  | "match_reminder"
  | "match_finished";

type NotifyResult = {
  ok: boolean;
  sent: number;
  status: number;
  error?: string;
};

async function sendNotification(payload: Record<string, unknown>): Promise<NotifyResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, sent: 0, status: 401, error: "No active session" };
  }

  const res = await fetch("/api/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = (await res.json().catch(() => ({}))) as {
    error?: string;
    sent?: number;
  };

  const sent = Number(result.sent || 0);
  if (!res.ok) {
    console.error(`[notify] API returned ${res.status}:`, result);
    return {
      ok: false,
      sent,
      status: res.status,
      error: result.error || "Notification request failed",
    };
  } else {
    console.log("[notify] Notifications sent:", result);
    return { ok: true, sent, status: res.status };
  }
}

/**
 * Notify players about newly created matches.
 * Non-blocking: errors are logged but don't interrupt the flow.
 */
export async function notifyMatchCreated(matchIds: number[]) {
  if (!matchIds.length) return { ok: true, sent: 0, status: 200 } as const;

  try {
    return await sendNotification({
      type: "match_created",
      match_ids: matchIds,
    });
  } catch (err) {
    console.error("[notify] Failed to send match notifications:", err);
    return {
      ok: false,
      sent: 0,
      status: 500,
      error: "Failed to send match notifications",
    };
  }
}

/**
 * Notify players when a match result is finalized.
 * Non-blocking: errors are logged but don't interrupt the flow.
 */
export async function notifyMatchFinished(matchId: number) {
  return notifyMatchByType(matchId, "match_finished");
}

export async function notifyMatchByType(
  matchId: number,
  type: MatchNotificationType
) {
  if (!matchId) {
    return { ok: false, sent: 0, status: 400, error: "Missing match ID" };
  }

  try {
    return await sendNotification({
      type,
      match_id: matchId,
    });
  } catch (err) {
    console.error(`[notify] Failed to send ${type} notification:`, err);
    return {
      ok: false,
      sent: 0,
      status: 500,
      error: `Failed to send ${type} notification`,
    };
  }
}
