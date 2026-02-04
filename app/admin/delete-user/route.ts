import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado (env faltante)" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const user_id = body?.user_id as string | undefined;

    if (!user_id) {
      return NextResponse.json({ error: "Falta user_id" }, { status: 400 });
    }

    // 1) Validar Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const accessToken = authHeader.replace("Bearer ", "");

    // 2) Obtener usuario logueado (valida el token)
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    });

    const { data: authData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
    }

    const requesterId = authData.user.id;

    // 3) Verificar admin + activo + tenant (recomendado)
    const { data: requesterProfile, error: requesterErr } = await supabaseAdmin
      .from("profiles")
      .select("role, active, tenant_id")
      .eq("id", requesterId)
      .single();

    if (requesterErr || !requesterProfile || requesterProfile.active !== true || requesterProfile.role !== "admin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    // 4) Traer perfil del target para validar tenant y evitar borrar admins
    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", user_id)
      .maybeSingle();

    if (targetErr || !targetProfile) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (targetProfile.role === "admin") {
      return NextResponse.json({ error: "No se puede eliminar un admin" }, { status: 400 });
    }

    if (requesterId === user_id) {
      return NextResponse.json({ error: "No podés eliminar tu propio usuario" }, { status: 400 });
    }

    if (targetProfile.tenant_id !== requesterProfile.tenant_id) {
      return NextResponse.json({ error: "No autorizado (tenant)" }, { status: 403 });
    }

    // 5) Eliminar de Auth
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    // 6) (Opcional) borrar perfil también, si tu DB no lo borra sola
    await supabaseAdmin.from("profiles").delete().eq("id", user_id);

    // 7) Log (si tu action_logs existe y tiene este schema)
    await supabaseAdmin.from("action_logs").insert({
      action: "ADMIN_DELETE_USER",
      entity: "auth",
      entity_id: user_id,
      metadata: { deleted_user_id: user_id },
      tenant_id: requesterProfile.tenant_id,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE USER ERROR:", e);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}