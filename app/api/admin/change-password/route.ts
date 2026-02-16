import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validar nueva contraseña
const passwordSchema = z.string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Debe contener una mayúscula")
  .regex(/[a-z]/, "Debe contener una minúscula")
  .regex(/[0-9]/, "Debe contener un número")
  .regex(/[!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]/, "Debe contener un carácter especial");

function debugProfileFlags(profile: any) {
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
    const { success } = rateLimit(`change-password:${ip}`, { maxRequests: 5, windowMs: 60_000 });
    if (!success) {
      return NextResponse.json({ error: "Demasiados intentos. Intentá en un minuto." }, { status: 429 });
    }

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado (env faltante)" },
        { status: 500 }
      );
    }

    // Crear cliente admin
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const user_id = body?.user_id as string | undefined;
    const new_password = body?.new_password as string | undefined;

    if (!user_id || !new_password) {
      return NextResponse.json(
        { error: "Faltan datos (user_id, new_password)" },
        { status: 400 }
      );
    }

    // Validar contraseña
    try {
      passwordSchema.parse(new_password);
    } catch (error: any) {
      return NextResponse.json(
        { error: error.errors?.[0]?.message || "Contraseña inválida" },
        { status: 400 }
      );
    }

    // Authorization: Bearer <token>
    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const accessToken = match[1].trim();

    // Obtener usuario actual
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

    // Verificar que el usuario actual es ADMIN
    const { data: requesterProfile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr || !requesterProfile) {
      return NextResponse.json(
        {
          error: "Permisos insuficientes (perfil inexistente)",
          ...(process.env.NODE_ENV === "development"
            ? { debug: debugProfileFlags(requesterProfile) }
            : {}),
        },
        { status: 403 }
      );
    }

    if (requesterProfile.role !== "admin") {
      return NextResponse.json(
        { error: "Solo admins pueden cambiar contraseñas de otros usuarios" },
        { status: 403 }
      );
    }

    if (requesterProfile.active !== true) {
      return NextResponse.json(
        { error: "Tu cuenta debe estar activa para realizar esta acción" },
        { status: 403 }
      );
    }

    // Cambiar contraseña usando Service Role
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { password: new_password }
    );

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || "Error cambiando contraseña" },
        { status: 500 }
      );
    }

    // Auditoría
    try {
      await supabaseAdmin.from("action_logs").insert({
        action: "ADMIN_CHANGE_PASSWORD",
        entity: "auth",
        entity_id: parseInt(user_id) || 0,
        user_id: user.id,
        user_email: user.email,
        metadata: {
          target_user_id: user_id,
          changed_by: user.email,
        },
      });
    } catch {
      // no-op
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
