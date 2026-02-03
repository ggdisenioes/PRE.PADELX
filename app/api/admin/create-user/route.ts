import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado (env faltante)" },
        { status: 500 }
      );
    }

    // Crear el cliente admin en runtime para evitar inicializaciones con env vacías
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const email = (body?.email as string | undefined)?.trim();
    const password = body?.password as string | undefined;
    const role = body?.role as "user" | "manager" | undefined;

    if (!email || !password || !role) {
      return NextResponse.json(
        {
          error: "Datos incompletos",
          ...(process.env.NODE_ENV !== "production"
            ? {
                debug: {
                  hasEmail: Boolean(email),
                  hasPassword: Boolean(password),
                  role: role ?? null,
                },
              }
            : {}),
        },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    if (!(["user", "manager"] as const).includes(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
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
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("role, active, tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json(
        {
          error: "Permisos insuficientes (no se pudo leer el perfil)",
          ...(process.env.NODE_ENV !== "production"
            ? {
                debug: {
                  ...debugProfileFlags(profile),
                  profileErr: {
                    message: (profileErr as any)?.message,
                    details: (profileErr as any)?.details,
                    hint: (profileErr as any)?.hint,
                    code: (profileErr as any)?.code,
                  },
                },
              }
            : {}),
        },
        { status: 403 }
      );
    }

    if (!profile) {
      return NextResponse.json(
        {
          error: "Permisos insuficientes (perfil inexistente)",
          ...(process.env.NODE_ENV !== "production" ? { debug: debugProfileFlags(profile) } : {}),
        },
        { status: 403 }
      );
    }

    if (profile.active !== true) {
      return NextResponse.json(
        {
          error: "Permisos insuficientes (usuario inactivo)",
          ...(process.env.NODE_ENV !== "production" ? { debug: debugProfileFlags(profile) } : {}),
        },
        { status: 403 }
      );
    }

    if (profile.role !== "admin") {
      return NextResponse.json(
        {
          error: "Permisos insuficientes (no sos admin)",
          ...(process.env.NODE_ENV !== "production" ? { debug: debugProfileFlags(profile) } : {}),
        },
        { status: 403 }
      );
    }

    if (!profile.tenant_id) {
      return NextResponse.json(
        {
          error: "Permisos insuficientes (tenant_id faltante en tu perfil)",
          ...(process.env.NODE_ENV !== "production" ? { debug: debugProfileFlags(profile) } : {}),
        },
        { status: 403 }
      );
    }

    // Crear usuario en Auth
    const { data: createdUser, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        // IMPORTANTE:
        // Si existe un trigger en auth.users (ej: public.handle_new_user) que crea el perfil
        // y tu schema exige tenant_id NOT NULL, necesitamos pasar el tenant_id en metadata
        // para que el trigger lo pueda leer desde `new.raw_user_meta_data`.
        user_metadata: {
          tenant_id: profile.tenant_id,
          role,
        },
        // Algunos setups leen raw_app_meta_data, lo duplicamos por compatibilidad.
        app_metadata: {
          tenant_id: profile.tenant_id,
          role,
        } as any,
      });

    if (createUserError || !createdUser.user) {
      return NextResponse.json(
        { error: createUserError?.message || "Error creando usuario" },
        { status: 500 }
      );
    }

    // Upsert del perfil del usuario creado con tenant del admin
    const { error: upsertProfileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: createdUser.user.id,
          email,
          role,
          active: true,
          tenant_id: profile.tenant_id,
        },
        { onConflict: "id" }
      );

    if (upsertProfileError) {
      return NextResponse.json({ error: upsertProfileError.message }, { status: 500 });
    }

    // Auditoría (tolerante)
    try {
      await supabaseAdmin.from("action_logs").insert({
        action: "ADMIN_CREATE_USER",
        entity: "auth",
        entity_id: createdUser.user.id,
        tenant_id: profile.tenant_id,
        metadata: {
          created_user_id: createdUser.user.id,
          created_email: email,
          role,
        },
      });
    } catch {
      // no-op
    }

    return NextResponse.json({ success: true, user_id: createdUser.user.id });
  } catch (error) {
    console.error("CREATE USER ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}