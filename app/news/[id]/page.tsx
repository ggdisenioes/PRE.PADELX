"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import Card from "../../components/Card";

type News = {
  id: number;
  title: string;
  content: string;
  image_url: string | null;
  created_at: string;
};

export default function NewsDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [news, setNews] = useState<News | null>(null);
  const [loading, setLoading] = useState(true);

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
    return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  }

  if (!news) {
    return <div className="p-8 text-center text-gray-500">Noticia no encontrada</div>;
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <Link href="/news" className="text-sm text-gray-600 hover:underline">
        ← Volver a noticias
      </Link>

      <Card className="p-8">
        {news.image_url && (
          <img
            src={news.image_url}
            alt={news.title}
            className="w-full h-96 object-cover rounded mb-6"
            loading="lazy"
          />
        )}

        <div className="mb-4">
          <p className="text-sm text-gray-500">
            {new Date(news.created_at).toLocaleDateString("es-ES")}
          </p>
        </div>

        <h1 className="text-3xl font-bold mb-4">{news.title}</h1>

        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700">
          {news.content}
        </div>
      </Card>
    </main>
  );
}
