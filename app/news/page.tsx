"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Link from "next/link";
import Card from "../components/Card";

type News = {
  id: number;
  title: string;
  content: string;
  image_url: string | null;
  created_at: string;
};

export default function NewsPage() {
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (sessionData?.session?.access_token) {
          headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
        }

        const response = await fetch("/api/news", { headers });
        const result = await response.json();

        if (response.ok) {
          setNews(result.news || []);
        }
      } catch (error) {
        console.error("Error fetching news:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando noticias...</div>;
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">📰 Noticias</h1>
      </div>

      {news.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No hay noticias publicadas aún.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {news.map((article) => (
            <Link key={article.id} href={`/news/${article.id}`}>
              <Card className="p-6 hover:shadow-lg transition cursor-pointer">
                <div className="flex gap-4">
                  {article.image_url && (
                    <img
                      src={article.image_url}
                      alt={article.title}
                      className="w-32 h-32 object-cover rounded"
                      loading="lazy"
                    />
                  )}
                  <div className="flex-1">
                    <h2 className="text-xl font-bold mb-2">{article.title}</h2>
                    <p className="text-gray-600 line-clamp-2">{article.content}</p>
                    <p className="text-xs text-gray-400 mt-3">
                      {new Date(article.created_at).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
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
