"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import Card from "../../components/Card";
import toast from "react-hot-toast";
import { useRole } from "../../hooks/useRole";
import { useTranslation } from "../../i18n";
import { resolveNewsText } from "@/lib/newsPayload";

type News = {
  id: number;
  title: string;
  content: string;
  image_url: string | null;
  image_urls?: string[];
  title_i18n?: { es?: string; en?: string };
  content_i18n?: { es?: string; en?: string };
  created_at: string;
};

export default function NewsDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isAdmin, isManager } = useRole();
  const canManageNews = isAdmin || isManager;
  const [news, setNews] = useState<News | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const newsId = useMemo(() => {
    const raw = params?.id;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }, [params]);

  useEffect(() => {
    if (!newsId || Number.isNaN(newsId)) {
      router.push("/news");
      return;
    }

    const fetchNews = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (sessionData?.session?.access_token) {
          headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
        }

        const response = await fetch(`/api/news/${newsId}`, { headers });
        const result = await response.json();

        if (response.ok) {
          setNews(result.news);
        } else {
          router.push("/news");
        }
      } catch (error) {
        console.error("Error fetching news:", error);
        router.push("/news");
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, [newsId, router]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">{t("news.loading")}</div>;
  }

  if (!news) {
    return (
      <div className="p-8 text-center text-gray-500">
        {locale === "en" ? "News not found" : "Noticia no encontrada"}
      </div>
    );
  }

  const handleDelete = async () => {
    if (!canManageNews || !news) return;
    if (!confirm(t("news.deleteConfirm"))) return;

    setDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers.Authorization = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch(`/api/news/${news.id}`, {
        method: "DELETE",
        headers,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(result.error || t("news.errorDeleting"));
        return;
      }

      toast.success(t("news.deleted"));
      router.push("/news");
    } catch (error) {
      console.error("Error deleting news:", error);
      toast.error(t("news.errorDeleting"));
    } finally {
      setDeleting(false);
    }
  };

  const localizedTitle = resolveNewsText(news.title_i18n, locale, news.title);
  const localizedContent = resolveNewsText(news.content_i18n, locale, news.content);
  const gallery = news.image_urls || (news.image_url ? [news.image_url] : []);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/news" className="text-sm text-gray-600 hover:underline">
          {locale === "en" ? "← Back to News" : "← Volver a noticias"}
        </Link>
        {canManageNews && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/news?edit=${news.id}`}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              {locale === "en" ? "Edit" : "Editar"}
            </Link>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting
                ? locale === "en"
                  ? "Deleting..."
                  : "Eliminando..."
                : locale === "en"
                  ? "Delete"
                  : "Eliminar"}
            </button>
          </div>
        )}
      </div>

      <Card className="p-8">
        {news.image_url && (
          <img
            src={news.image_url}
            alt={localizedTitle}
            className="w-full h-72 sm:h-96 object-cover rounded mb-6"
            loading="lazy"
          />
        )}

        {gallery.length > 1 && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {gallery.slice(1).map((imageUrl) => (
              <img
                key={imageUrl}
                src={imageUrl}
                alt={localizedTitle}
                className="h-28 sm:h-32 w-full object-cover rounded border border-gray-200"
                loading="lazy"
              />
            ))}
          </div>
        )}

        <div className="mb-4">
          <p className="text-sm text-gray-500">
            {new Date(news.created_at).toLocaleDateString(
              locale === "en" ? "en-US" : "es-ES"
            )}
          </p>
        </div>

        <h1 className="text-3xl font-bold mb-4">{localizedTitle}</h1>

        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700">
          {localizedContent}
        </div>
      </Card>
    </main>
  );
}
