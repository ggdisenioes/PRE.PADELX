"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Card from "../../components/Card";
import toast from "react-hot-toast";
import { z } from "zod";
import { useTranslation } from "../../i18n";

const newsSchema = z.object({
  title: z.string().min(1, "Título requerido"),
  content: z.string().min(1, "Contenido requerido"),
  published: z.boolean(),
  featured: z.boolean(),
  image_url: z.string().optional(),
});

type News = z.infer<typeof newsSchema> & { id: number };
type FormNews = Partial<typeof newsSchema>;

export default function AdminNewsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<FormNews>({
    title: "",
    content: "",
    published: false,
    featured: false,
    image_url: "",
  });

  useEffect(() => {
    checkAuth();
    fetchNews();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
      router.push("/");
      return;
    }
  };

  const fetchNews = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch("/api/news?admin=true", { headers });
      const result = await response.json();

      if (response.ok) {
        setNews(result.news || []);
      }
    } catch (error) {
      console.error("Error fetching news:", error);
      toast.error(t("admin.newsAdmin.errorLoading"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const validated = newsSchema.parse(formData);
      const { data: sessionData } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      let response;

      if (editingId) {
        response = await fetch(`/api/news/${editingId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(validated),
        });
      } else {
        response = await fetch("/api/news", {
          method: "POST",
          headers,
          body: JSON.stringify(validated),
        });
      }

      const result = await response.json();

      if (response.ok) {
        toast.success(editingId ? t("news.saved") : t("news.created"));
        setFormData({
          title: "",
          content: "",
          published: false,
          featured: false,
          image_url: "",
        });
        setEditingId(null);
        setShowForm(false);
        fetchNews();
      } else {
        toast.error(result.error || t("news.errorSaving"));
      }
    } catch (error: any) {
      toast.error(error.message || t("news.errorSaving"));
    }
  };

  const handleEdit = (item: News) => {
    setFormData({
      title: item.title,
      content: item.content,
      published: item.published,
      featured: item.featured,
      image_url: item.image_url || "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("admin.newsAdmin.deleteConfirm"))) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch(`/api/news/${id}`, {
        method: "DELETE",
        headers,
      });

      if (response.ok) {
        toast.success(t("admin.newsAdmin.deleted"));
        fetchNews();
      } else {
        toast.error(t("admin.newsAdmin.errorDeleting"));
      }
    } catch (error) {
      toast.error(t("common.error"));
    }
  };

  if (loading) {
    return <div className="p-8 text-center">{t("admin.newsAdmin.loading")}</div>;
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">📝 {t("admin.newsAdmin.title")}</h1>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
            if (showForm) {
              setFormData({
                title: "",
                content: "",
                published: false,
                featured: false,
                image_url: "",
              });
            }
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showForm ? t("common.cancel") : `+ ${t("admin.newsAdmin.create")}`}
        </button>
      </div>

      {showForm && (
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            {editingId ? t("news.editTitle") : t("news.createTitle")}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("news.titleField")}</label>
              <input
                type="text"
                value={formData.title || ""}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("news.content")}</label>
              <textarea
                value={formData.content || ""}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg h-40"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("news.imageUrl")} ({t("common.optional")})</label>
              <input
                type="url"
                value={formData.image_url || ""}
                onChange={(e) =>
                  setFormData({ ...formData, image_url: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.published || false}
                  onChange={(e) =>
                    setFormData({ ...formData, published: e.target.checked })
                  }
                />
                <span className="text-sm">{t("news.published")}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.featured || false}
                  onChange={(e) =>
                    setFormData({ ...formData, featured: e.target.checked })
                  }
                />
                <span className="text-sm">{t("news.featured")}</span>
              </label>
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              {editingId ? t("common.save") : t("common.create")}
            </button>
          </form>
        </Card>
      )}

      <div className="space-y-3">
        {news.map((item) => (
          <Card key={item.id} className="p-4 flex justify-between items-start gap-4">
            <div className="flex-1">
              <h3 className="font-bold">{item.title}</h3>
              <p className="text-sm text-gray-600 line-clamp-2">{item.content}</p>
              <div className="flex gap-2 mt-2">
                {item.published && (
                  <span className="text-xs px-2 py-1 bg-green-200 text-green-800 rounded">
                    {t("news.published")}
                  </span>
                )}
                {item.featured && (
                  <span className="text-xs px-2 py-1 bg-yellow-200 text-yellow-800 rounded">
                    {t("news.featured")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleEdit(item)}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                {t("common.edit")}
              </button>
              <button
                onClick={() => handleDelete(item.id)}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              >
                {t("common.delete")}
              </button>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
