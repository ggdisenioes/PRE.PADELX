import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function debugFlags(profile: any) {
  return {
    hasProfile: Boolean(profile),
    role: profile?.role ?? null,
    active: profile?.active ?? null,
    hasTenantId: Boolean(profile?.tenant_id),
  };
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = rateLimit(`delete-user:${ip}`, { maxRequests: 5, windowMs: 60_000 });
    if (!success) {
      return NextResponse.json({ error: "Demasiados intentos. Intentá en un minuto." }, { status: 429 });
    }

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado (env faltante)" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const user_id = body?.user_id as string | undefined;

    if (!user_id) {
      return NextResponse.json({ error: "Falta user_id" }, { status: 400 });
    }

    // Authorization: Bearer <token>
    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const accessToken = match[1].trim();

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
    }

    // Verificar admin + activo + tenant
    const { data: requester, error: requesterErr } = await supabaseAdmin
      .from("profiles")
      .select("role, active, tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (requesterErr) {
      return NextResponse.json(
        {
          error: "Permisos insuficientes (no se pudo leer el perfil)",
          ...(process.env.NODE_ENV !== "production"
            ? {
                debug: {
                  ...debugFlags(requester),
                  requesterErr: {
                    message: (requesterErr as any)?.message,
                    details: (requesterErr as any)?.details,
                    hint: (requesterErr as any)?.hint,
                    code: (requesterErr as any)?.code,
                  },
                },
              }
            : {}),
        },
        { status: 403 }
      );
    }

    if (!requester) {
      return NextResponse.json(
        {
          error: "Permisos insuficientes (perfil inexistente)",
          ...(process.env.NODE_ENV !== "production"
            ? { debug: debugFlags(requester) }
            : {}),
        },
        { status: 403 }
      );
    }

    if (requester.active !== true) {
      return NextResponse.json(
        {
          error: "Permisos insuficientes (usuario inactivo)",
          ...(process.env.NODE_ENV !== "production"
            ? { debug: debugFlags(requester) }
            : {}),
        },
        { status: 403 }
      );
    }

    if (requester.role !== "admin") {
      return NextResponse.json(
        {
          error: "Permisos insuficientes (no sos admin)",
          ...(process.env.NODE_ENV !== "production"
            ? { debug: debugFlags(requester) }
            : {}),
        },
        { status: 403 }
      );
    }

    if (!requester.tenant_id) {
      return NextResponse.json(
        {
          error: "Permisos insuficientes (tenant_id faltante en tu perfil)",
          ...(process.env.NODE_ENV !== "production"
            ? { debug: debugFlags(requester) }
            : {}),
        },
        { status: 403 }
      );
    }

    // No permitir borrarse a sí mismo
    if (user.id === user_id) {
      return NextResponse.json(
        { error: "No podés eliminar tu propio usuario" },
        { status: 400 }
      );
    }

    // Validar target: existe, mismo tenant, no admin
    const { data: target, error: targetErr } = await supabaseAdmin
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", user_id)
      .maybeSingle();

    if (targetErr) {
      return NextResponse.json(
        { error: targetErr.message || "Error buscando usuario" },
        { status: 500 }
      );
    }

    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (target.role === "admin") {
      return NextResponse.json(
        { error: "No se puede eliminar un usuario admin" },
        { status: 400 }
      );
    }

    if (target.tenant_id !== requester.tenant_id) {
      return NextResponse.json({ error: "No autorizado (tenant)" }, { status: 403 });
    }

    // 1) Eliminar del Auth
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    // 2) Limpieza de profile (por si no hay cascade)
    await supabaseAdmin.from("profiles").delete().eq("id", user_id);

    // 3) Auditoría (tolerante)
    try {
      await supabaseAdmin.from("action_logs").insert({
        action: "ADMIN_DELETE_USER",
        entity: "auth",
        entity_id: user_id,
        tenant_id: requester.tenant_id,
        metadata: {
          deleted_user_id: user_id,
          deleted_by: user.id,
        },
      });
    } catch {
      // no-op
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE USER ERROR:", e);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}