export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  user_id?: string;
  role?: string;
};

const ALLOWED_ROLES = new Set(["admin", "manager", "user"]);

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json({ error: "Servidor mal configurado." }, { status: 500 });
    }

    // 1) Auth del requester por bearer token (JWT)
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: requesterUser, error: userErr } = await userClient.auth.getUser();
    if (userErr || !requesterUser?.user)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    // 2) Body
    const body = (await request.json()) as Body;
    const targetId = (body.user_id || "").trim();
    const newRole = (body.role || "").toLowerCase();

    if (!targetId || !ALLOWED_ROLES.has(newRole)) {
      return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
    }

    // 3) Validación de requester (admin activo con tenant)
    const { data: requesterProfile, error: requesterErr } = await adminClient
      .from("profiles")
      .select("id, role, active, tenant_id")
      .eq("id", requesterUser.user.id)
      .maybeSingle();

    if (requesterErr || !requesterProfile) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (
      requesterProfile.active !== true ||
      requesterProfile.role !== "admin" ||
      !requesterProfile.tenant_id
    ) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 4) Cambio de rol con función SQL security definer (service-only)
    const { data: rpcData, error: rpcErr } = await adminClient.rpc("admin_set_user_role", {
      p_actor_user_id: requesterUser.user.id,
      p_target_user_id: targetId,
      p_new_role: newRole,
    });

    if (rpcErr) {
      const code = String(rpcErr.code || "");
      const msg = String(rpcErr.message || "No se pudo actualizar el rol.");

      if (code === "22023") {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      if (code === "P0002") {
        return NextResponse.json({ error: msg }, { status: 404 });
      }
      if (code === "42501") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      if (code === "P0001") {
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // 5) Reflejar rol en auth metadata (best-effort)
    await adminClient.auth.admin.updateUserById(targetId, {
      app_metadata: { role: newRole },
      user_metadata: { role: newRole },
    }).catch(() => {});

    return NextResponse.json(
      typeof rpcData === "object" && rpcData
        ? rpcData
        : { success: true, user_id: targetId, role: newRole }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
