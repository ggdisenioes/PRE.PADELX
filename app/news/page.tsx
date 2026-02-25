"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Card from "../components/Card";
import { useRole } from "../hooks/useRole";
import { supabase } from "../lib/supabase";

type News = {
  id: number;
  title: string;
  content: string;
  image_url: string | null;
  created_at: string;
};

export default function NewsPage() {
  const router = useRouter();
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
        toast.error(result.error || "No se pudieron cargar las noticias.");
      } catch (error) {
        console.error("Error fetching news:", error);
        toast.error("Error cargando noticias.");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const handleDelete = async (newsId: number) => {
    if (!canManageNews) return;
    if (!confirm("¿Eliminar esta noticia?")) return;

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
        toast.error(result.error || "No se pudo eliminar la noticia.");
        return;
      }

      setNews((prev) => prev.filter((item) => item.id !== newsId));
      toast.success("Noticia eliminada.");
    } catch (error) {
      console.error("Error deleting news:", error);
      toast.error("Error eliminando noticia.");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando noticias...</div>;
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-3xl font-bold">📰 Noticias</h1>
        {canManageNews && (
          <Link
            href="/admin/news"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold"
          >
            + Nueva Noticia
          </Link>
        )}
      </div>

      {news.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No hay noticias publicadas aún.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {news.map((article) => (
            <Card key={article.id} className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row">
                {article.image_url && (
                  <img
                    src={article.image_url}
                    alt={article.title}
                    className="w-full h-40 sm:h-32 sm:w-32 object-cover rounded"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold mb-2 break-words">{article.title}</h2>
                  <p className="text-gray-600 line-clamp-3">{article.content}</p>
                  <p className="text-xs text-gray-400 mt-3">
                    {new Date(article.created_at).toLocaleDateString("es-ES")}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/news/${article.id}`}
                      className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Ver detalle
                    </Link>

                    {canManageNews && (
                      <>
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/news?edit=${article.id}`)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(article.id)}
                          disabled={deletingId === article.id}
                          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {deletingId === article.id ? "Eliminando..." : "Eliminar"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="pt-4">
        <Link href="/" className="text-sm text-gray-600 hover:underline">
          ← Volver al inicio
        </Link>
      </div>
    </main>
  );
}
