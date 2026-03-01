import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  buildNewsContentPayload,
  decodeNewsRecord,
  ensureCoverAndImages,
  resolveNewsText,
} from "@/lib/newsPayload";
import { buildBilingualNewsText, type SupportedLocale } from "@/lib/autoTranslate";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_NEWS_COVER = "/logo-fondo.png";

const localizedFieldSchema = z
  .object({
    es: z.string().optional(),
    en: z.string().optional(),
  })
  .optional();

const newsUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().optional(),
  title_i18n: localizedFieldSchema,
  content_i18n: localizedFieldSchema,
  source_locale: z.enum(["es", "en"]).optional(),
  published: z.boolean().optional(),
  featured: z.boolean().optional(),
  image_url: z.string().url().optional().or(z.literal("")),
  image_urls: z.array(z.string().url()).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado" },
        { status: 500 }
      );
    }

    const { id } = await params;
    const newsId = parseInt(id, 10);

    if (isNaN(newsId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
    });

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    // Query news scoped to user's tenant
    const { data: news, error } = await supabaseClient
      .from("news")
      .select("*")
      .eq("id", newsId)
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (error || !news) {
      return NextResponse.json({ error: "Noticia no encontrada" }, { status: 404 });
    }

    // Unpublished news only visible to admin/manager
    if (news.published === false) {
      if (profile.role !== "admin" && profile.role !== "manager") {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
      }
    }

    const decoded = decodeNewsRecord(news as any);

    return NextResponse.json({
      news: {
        ...news,
        title: decoded.title,
        content: decoded.content,
        title_i18n: decoded.title_i18n,
        content_i18n: decoded.content_i18n,
        image_url: decoded.cover_image_url,
        image_urls: decoded.image_urls,
      },
    });
  } catch (error) {
    console.error("NEWS GET ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado" },
        { status: 500 }
      );
    }

    const { id } = await params;
    const newsId = parseInt(id, 10);

    if (isNaN(newsId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
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
      .select("role, tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
      return NextResponse.json(
        { error: "Solo admins/managers pueden editar noticias" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = newsUpdateSchema.parse(body);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: currentNews, error: currentNewsError } = await supabaseAdmin
      .from("news")
      .select("id, title, content, image_url")
      .eq("id", newsId)
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (currentNewsError || !currentNews) {
      return NextResponse.json({ error: "Noticia no encontrada" }, { status: 404 });
    }

    const currentDecoded = decodeNewsRecord(currentNews as any);

    const hasI18nInput = Boolean(
      validated.title_i18n?.es ||
      validated.title_i18n?.en ||
      validated.content_i18n?.es ||
      validated.content_i18n?.en
    );

    let nextTitleEs = "";
    let nextTitleEn = "";
    let nextContentEs = "";
    let nextContentEn = "";

    if (hasI18nInput) {
      nextTitleEs =
        validated.title_i18n?.es?.trim() ||
        validated.title?.trim() ||
        currentDecoded.title_i18n.es ||
        currentDecoded.title;

      nextTitleEn =
        validated.title_i18n?.en?.trim() ||
        validated.title?.trim() ||
        currentDecoded.title_i18n.en ||
        nextTitleEs;

      nextContentEs =
        validated.content_i18n?.es?.trim() ||
        validated.content?.trim() ||
        currentDecoded.content_i18n.es ||
        currentDecoded.content;

      nextContentEn =
        validated.content_i18n?.en?.trim() ||
        validated.content?.trim() ||
        currentDecoded.content_i18n.en ||
        nextContentEs;
    } else {
      const sourceLocale: SupportedLocale =
        validated.source_locale === "en" ? "en" : "es";

      const fallbackTitle = resolveNewsText(
        currentDecoded.title_i18n,
        sourceLocale,
        currentDecoded.title
      );
      const fallbackContent = resolveNewsText(
        currentDecoded.content_i18n,
        sourceLocale,
        currentDecoded.content
      );

      const sourceTitle = validated.title?.trim() || fallbackTitle;
      const sourceContent = validated.content?.trim() || fallbackContent;

      const bilingual = await buildBilingualNewsText({
        sourceLocale,
        title: sourceTitle,
        content: sourceContent,
      });

      nextTitleEs = bilingual.titleEs;
      nextTitleEn = bilingual.titleEn;
      nextContentEs = bilingual.contentEs;
      nextContentEn = bilingual.contentEn;
    }

    if (!nextTitleEs) {
      return NextResponse.json({ error: "Título requerido" }, { status: 400 });
    }
    if (!nextContentEs) {
      return NextResponse.json({ error: "Contenido requerido" }, { status: 400 });
    }

    const hasExplicitImages =
      validated.image_urls !== undefined || validated.image_url !== undefined;

    const imageSeed = hasExplicitImages
      ? validated.image_urls
      : currentDecoded.image_urls;

    const { coverImageUrl, imageUrls } = ensureCoverAndImages({
      image_url:
        validated.image_url !== undefined
          ? validated.image_url || null
          : currentDecoded.cover_image_url,
      image_urls: imageSeed,
      defaultCoverUrl: DEFAULT_NEWS_COVER,
    });

    const { data: news, error } = await supabaseAdmin
      .from("news")
      .update({
        title: nextTitleEs,
        content: buildNewsContentPayload({
          title_i18n: {
            es: nextTitleEs,
            en: nextTitleEn,
          },
          content_i18n: {
            es: nextContentEs,
            en: nextContentEn,
          },
          image_urls: imageUrls,
        }),
        image_url: coverImageUrl,
        published: validated.published,
        featured: validated.featured,
        updated_at: new Date().toISOString(),
      })
      .eq("id", newsId)
      .eq("tenant_id", profile.tenant_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    try {
      await supabaseAdmin.from("action_logs").insert({
        action: "NEWS_UPDATED",
        entity: "news",
        entity_id: newsId,
        user_id: user.id,
        user_email: user.email,
        metadata: validated,
      });
    } catch {
      // Silent fail
    }

    const decoded = decodeNewsRecord(news as any);

    return NextResponse.json({
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
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }
    console.error("NEWS PUT ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado" },
        { status: 500 }
      );
    }

    const { id } = await params;
    const newsId = parseInt(id, 10);

    if (isNaN(newsId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
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
      .select("role, tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
      return NextResponse.json(
        { error: "Solo admins/managers pueden eliminar noticias" },
        { status: 403 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { error } = await supabaseAdmin
      .from("news")
      .delete()
      .eq("id", newsId)
      .eq("tenant_id", profile.tenant_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    try {
      await supabaseAdmin.from("action_logs").insert({
        action: "NEWS_DELETED",
        entity: "news",
        entity_id: newsId,
        user_id: user.id,
        user_email: user.email,
      });
    } catch {
      // Silent fail
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("NEWS DELETE ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
