"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Card from "../components/Card";
import { useRole } from "../hooks/useRole";
import { supabase } from "../lib/supabase";
import { useTranslation } from "../i18n";
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

export default function NewsPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isAdmin, isManager } = useRole();
  const canManageNews = isAdmin || isManager;
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (sessionData?.session?.access_token) {
          headers.Authorization = `Bearer ${sessionData.session.access_token}`;
        }

        const response = await fetch("/api/news", { headers });
        const result = await response.json();

        if (response.ok) {
          setNews(result.news || []);
          return;
        }
        toast.error(result.error || t("news.errorLoading"));
      } catch (error) {
        console.error("Error fetching news:", error);
        toast.error(t("news.errorLoading"));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const handleDelete = async (newsId: number) => {
    if (!canManageNews) return;
    if (!confirm(t("news.deleteConfirm"))) return;

    setDeletingId(newsId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers.Authorization = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch(`/api/news/${newsId}`, {
        method: "DELETE",
        headers,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(result.error || t("news.errorDeleting"));
        return;
      }

      setNews((prev) => prev.filter((item) => item.id !== newsId));
      toast.success(t("news.deleted"));
    } catch (error) {
      console.error("Error deleting news:", error);
      toast.error(t("news.errorDeleting"));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">{t("news.loading")}</div>;
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-3xl font-bold">📰 {t("news.title")}</h1>
        {canManageNews && (
          <Link
            href="/admin/news"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold"
          >
            + {t("news.create")}
          </Link>
        )}
      </div>

      {news.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500">{t("news.empty")}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {news.map((article) => (
            <Card key={article.id} className="p-5 sm:p-6">
              {(() => {
                const localizedTitle = resolveNewsText(
                  article.title_i18n,
                  locale,
                  article.title
                );
                const localizedContent = resolveNewsText(
                  article.content_i18n,
                  locale,
                  article.content
                );
                const gallery = article.image_urls || (article.image_url ? [article.image_url] : []);
                const cover = article.image_url || gallery[0] || null;

                return (
                  <div className="flex flex-col gap-4 sm:flex-row">
                    {cover && (
                      <img
                        src={cover}
                        alt={localizedTitle}
                        className="w-full h-40 sm:h-32 sm:w-32 object-cover rounded"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-bold mb-2 break-words">{localizedTitle}</h2>
                      <p className="text-gray-600 line-clamp-3">{localizedContent}</p>
                      <p className="text-xs text-gray-400 mt-3">
                        {new Date(article.created_at).toLocaleDateString(
                          locale === "en" ? "en-US" : "es-ES"
                        )}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={`/news/${article.id}`}
                          className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          {t("news.readMore")}
                        </Link>

                        {canManageNews && (
                          <>
                            <button
                              type="button"
                              onClick={() => router.push(`/admin/news?edit=${article.id}`)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
                            >
                              {locale === "en" ? "Edit" : "Editar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(article.id)}
                              disabled={deletingId === article.id}
                              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              {deletingId === article.id
                                ? locale === "en"
                                  ? "Deleting..."
                                  : "Eliminando..."
                                : locale === "en"
                                  ? "Delete"
                                  : "Eliminar"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </Card>
          ))}
        </div>
      )}

      <div className="pt-4">
        <Link href="/" className="text-sm text-gray-600 hover:underline">
          {locale === "en" ? "← Back to Home" : "← Volver al inicio"}
        </Link>
      </div>
    </main>
  );
}
