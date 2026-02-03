import { supabase } from "./supabase";

/**
 * Tipos de acciones recomendadas (no obligatorio, pero ayuda a consistencia)
 */
export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE_PLAYER"
  | "UPDATE_PLAYER"
  | "APPROVE_PLAYER"
  | "REJECT_PLAYER"
  | "DELETE_PLAYER"
  | "CREATE_MATCH"
  | "UPDATE_MATCH"
  | "UPDATE_MATCH_SCORE"
  | "SET_MATCH_RESULT"
  | "EDIT_MATCH_RESULT"
  | "DELETE_MATCH"
  | "CREATE_TOURNAMENT"
  | "UPDATE_TOURNAMENT"
  | "DELETE_TOURNAMENT"
  | "CLOSE_TOURNAMENT";

type LogActionParams = {
  action: AuditAction;
  entity: "player" | "match" | "tournament" | "auth" | string;
  entityId?: number;
  metadata?: Record<string, any>;
};

/**
 * Log centralizado de auditoría
 * - Se usa SOLO para mutaciones (create/update/delete)
 * - No rompe el flujo si falla
 */
export const logAction = async ({
  action,
  entity,
  entityId,
  metadata = {},
}: LogActionParams) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await supabase.from("action_logs").insert([
      {
        user_id: user.id,
        user_email: user.email,
        action,
        entity,
        entity_id: entityId ?? null,
        metadata,
      },
    ]);
  } catch (err) {
    // ⚠️ NUNCA romper la app por un log
    console.error("[AUDIT LOG ERROR]", err);
  }
};