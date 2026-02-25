import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  buildNewsContentPayload,
  decodeNewsRecord,
  ensureCoverAndImages,
} from "@/lib/newsPayload";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_NEWS_COVER = "/logo.svg";

const localizedFieldSchema = z
  .object({
    es: z.string().optional(),
    en: z.string().optional(),
  })
  .optional();

const newsSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().optional(),
  title_i18n: localizedFieldSchema,
  content_i18n: localizedFieldSchema,
  published: z.boolean().optional(),
  featured: z.boolean().optional(),
  image_url: z.string().url().optional().or(z.literal("")),
  image_urls: z.array(z.string().url()).optional(),
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

    const normalizedNews = (news || []).map((item: any) => {
      const decoded = decodeNewsRecord(item);
      return {
        ...item,
        title: decoded.title,
        content: decoded.content,
        title_i18n: decoded.title_i18n,
        content_i18n: decoded.content_i18n,
        image_url: decoded.cover_image_url,
        image_urls: decoded.image_urls,
      };
    });

    return NextResponse.json({ news: normalizedNews });
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

    const titleEs =
      validated.title_i18n?.es?.trim() || validated.title?.trim() || "";
    const titleEn =
      validated.title_i18n?.en?.trim() || validated.title?.trim() || titleEs;
    const contentEs =
      validated.content_i18n?.es?.trim() || validated.content?.trim() || "";
    const contentEn =
      validated.content_i18n?.en?.trim() || validated.content?.trim() || contentEs;

    if (!titleEs) {
      return NextResponse.json({ error: "Título requerido" }, { status: 400 });
    }
    if (!contentEs) {
      return NextResponse.json({ error: "Contenido requerido" }, { status: 400 });
    }

    const { coverImageUrl, imageUrls } = ensureCoverAndImages({
      image_url: validated.image_url || null,
      image_urls: validated.image_urls,
      defaultCoverUrl: DEFAULT_NEWS_COVER,
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: news, error } = await supabaseAdmin
      .from("news")
      .insert({
        tenant_id: profile.tenant_id,
        author_id: user.id,
        title: titleEs,
        content: buildNewsContentPayload({
          title_i18n: {
            es: titleEs,
            en: titleEn,
          },
          content_i18n: {
            es: contentEs,
            en: contentEn,
          },
          image_urls: imageUrls,
        }),
        published: validated.published || false,
        featured: validated.featured || false,
        image_url: coverImageUrl,
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
        metadata: {
          title_i18n: {
            es: titleEs,
            en: titleEn,
          },
        },
        tenant_id: profile.tenant_id,
      });
    } catch {
      // Silent fail
    }

    const decoded = decodeNewsRecord(news as any);

    return NextResponse.json(
      {
        success: true,
        news: {
          ...news,
          title: decoded.title,
          content: decoded.content,
          title_i18n: decoded.title_i18n,
          content_i18n: decoded.content_i18n,
          image_url: decoded.cover_image_url,
          image_urls: decoded.image_urls,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }
    console.error("NEWS POST ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
