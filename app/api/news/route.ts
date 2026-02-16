import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const newsSchema = z.object({
  title: z.string().min(1, "Título requerido").max(200),
  content: z.string().min(1, "Contenido requerido"),
  published: z.boolean().optional(),
  featured: z.boolean().optional(),
  image_url: z.string().url().optional().or(z.literal("")),
});

export async function GET(req: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const adminMode = searchParams.get("admin") === "true";

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    let query = supabaseClient
      .from("news")
      .select("id, title, content, image_url, published, featured, created_at, author_id")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false });

    if (adminMode && (profile.role === "admin" || profile.role === "manager")) {
      // Admin/Manager can see all news
      query = query;
    } else {
      // Regular users only see published news
      query = query.eq("published", true);
    }

    const { data: news, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ news });
  } catch (error) {
    console.error("NEWS GET ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado" },
        { status: 500 }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
      return NextResponse.json(
        { error: "Solo admins/managers pueden crear noticias" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = newsSchema.parse(body);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: news, error } = await supabaseAdmin
      .from("news")
      .insert({
        tenant_id: profile.tenant_id,
        author_id: user.id,
        title: validated.title,
        content: validated.content,
        published: validated.published || false,
        featured: validated.featured || false,
        image_url: validated.image_url || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    try {
      await supabaseAdmin.from("action_logs").insert({
        action: "NEWS_CREATED",
        entity: "news",
        entity_id: news.id,
        user_id: user.id,
        user_email: user.email,
        metadata: { title: validated.title },
        tenant_id: profile.tenant_id,
      });
    } catch {
      // Silent fail
    }

    return NextResponse.json({ success: true, news }, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }
    console.error("NEWS POST ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
