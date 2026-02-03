import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

type CookieToSet = {
  name: string;
  value: string;
  options?: {
    domain?: string;
    path?: string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    secure?: boolean;
    sameSite?: boolean | "lax" | "strict" | "none";
  };
};

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128).optional(),
  full_name: z.string().min(1).max(120).optional(),
  role: z.enum(["manager", "staff", "user"]).default("user"), // no permitir admin acá
  active: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Response base para capturar cookies si Supabase las refresca
  const cookieRes = NextResponse.next();
  const withSupabaseCookies = (out: NextResponse) => {
    cookieRes.cookies.getAll().forEach((c) => out.cookies.set(c));
    return out;
  };

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          const sameSite =
            options?.sameSite === true
              ? "strict"
              : options?.sameSite === false
                ? undefined
                : options?.sameSite;

          cookieRes.cookies.set({
            name,
            value,
            ...(options ?? {}),
            ...(sameSite ? { sameSite } : {}),
          });
        });
      },
    },
  });

  // 1) Auth requerido
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return withSupabaseCookies(
      NextResponse.json({ error: "unauthorized" }, { status: 401 })
    );
  }

  // 2) Chequeo admin + active (RLS permite select own)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.active !== true || profile.role !== "admin") {
    return withSupabaseCookies(
      NextResponse.json({ error: "forbidden" }, { status: 403 })
    );
  }

  // 3) Validación payload
  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return withSupabaseCookies(
      NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    );
  }

  // 4) Admin API con service role (server-only)
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const createResult = await admin.auth.admin.createUser({
    email: parsed.email,
    password: parsed.password,
    email_confirm: true,
    user_metadata: parsed.full_name ? { full_name: parsed.full_name } : undefined,
  });

  if (createResult.error || !createResult.data?.user) {
    return withSupabaseCookies(
      NextResponse.json(
        { error: "create_user_failed", details: createResult.error?.message },
        { status: 400 }
      )
    );
  }

  const newUser = createResult.data.user;

  // 5) Upsert perfil (service role bypass RLS)
  const upsertProfile = await admin
    .from("profiles")
    .upsert(
      { id: newUser.id, role: parsed.role, active: parsed.active ?? true },
      { onConflict: "id" }
    );

  if (upsertProfile.error) {
    // rollback opcional
    await admin.auth.admin.deleteUser(newUser.id);
    return withSupabaseCookies(
      NextResponse.json({ error: "profile_upsert_failed" }, { status: 500 })
    );
  }

  // 6) Auditoría (con sesión del admin; tu trigger fija user_id real)
  await supabase.from("action_logs").insert({
    action_type: "admin_create_user",
    details: JSON.stringify({
      created_user_id: newUser.id,
      created_email: parsed.email,
      role: parsed.role,
    }),
  });

  return withSupabaseCookies(
    NextResponse.json(
      { ok: true, user: { id: newUser.id, email: newUser.email } },
      { status: 201 }
    )
  );
}

export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}