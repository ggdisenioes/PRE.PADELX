"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Card from "../../components/Card";
import toast from "react-hot-toast";
import { z } from "zod";
import { useTranslation } from "../../i18n";

const newsSchema = z.object({
  title: z.string().min(1, "Titulo requerido"),
  content: z.string().min(1, "Contenido requerido"),
  published: z.boolean(),
  featured: z.boolean(),
  image_url: z.string().url().optional().or(z.literal("")),
});

type NewsPayload = z.infer<typeof newsSchema>;
type News = {
  id: number;
  title: string;
  content: string;
  published: boolean;
  featured: boolean;
  image_url: string | null;
};

const emptyFormData = (): NewsPayload => ({
  title: "",
  content: "",
  published: false,
  featured: false,
  image_url: "",
});

export default function AdminNewsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<NewsPayload>(emptyFormData());
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");

  useEffect(() => {
    void checkAuth();
    void fetchNews();
  }, []);

  const resetForm = () => {
    setFormData(emptyFormData());
    setSelectedImageFile(null);
    setImagePreview("");
    setEditingId(null);
  };

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
        headers.Authorization = `Bearer ${sessionData.session.access_token}`;
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

  const uploadNewsImage = async (file: File) => {
    const extension = file.name.split(".").pop() || "jpg";
    const randomPart =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const filePath = `news/${randomPart}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten archivos de imagen.");
      e.target.value = "";
      return;
    }

    const maxFileSizeMb = 5;
    if (file.size > maxFileSizeMb * 1024 * 1024) {
      toast.error(`La imagen no puede superar ${maxFileSizeMb}MB.`);
      e.target.value = "";
      return;
    }

    setSelectedImageFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const validated = newsSchema.parse(formData);
      const { data: sessionData } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers.Authorization = `Bearer ${sessionData.session.access_token}`;
      }

      let imageUrl = validated.image_url || "";
      if (selectedImageFile) {
        imageUrl = await uploadNewsImage(selectedImageFile);
      }

      const payload: NewsPayload = {
        ...validated,
        image_url: imageUrl,
      };

      const response = await fetch(
        editingId ? `/api/news/${editingId}` : "/api/news",
        {
          method: editingId ? "PUT" : "POST",
          headers,
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || t("news.errorSaving"));
        return;
      }

      toast.success(editingId ? t("news.saved") : t("news.created"));
      resetForm();
      setShowForm(false);
      await fetchNews();
    } catch (error: any) {
      toast.error(error?.message || t("news.errorSaving"));
    } finally {
      setSaving(false);
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
    setSelectedImageFile(null);
    setImagePreview(item.image_url || "");
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
        headers.Authorization = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch(`/api/news/${id}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        toast.error(t("admin.newsAdmin.errorDeleting"));
        return;
      }

      toast.success(t("admin.newsAdmin.deleted"));
      await fetchNews();
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
        <h1 className="text-3xl font-bold">{t("admin.newsAdmin.title")}</h1>
        <button
          onClick={() => {
            if (showForm) {
              resetForm();
              setShowForm(false);
              return;
            }
            resetForm();
            setShowForm(true);
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
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("news.content")}</label>
              <textarea
                value={formData.content}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, content: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg h-40"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">
                {t("news.imageUrl")} ({t("common.optional")})
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <p className="text-xs text-gray-500">
                Formatos soportados: JPG, PNG, WEBP. Maximo 5MB.
              </p>

              {(imagePreview || formData.image_url) && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                  <img
                    src={imagePreview || formData.image_url || ""}
                    alt="Preview de noticia"
                    className="h-36 w-full object-cover rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedImageFile(null);
                      setImagePreview("");
                      setFormData((prev) => ({ ...prev, image_url: "" }));
                    }}
                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Quitar imagen
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.published}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, published: e.target.checked }))
                  }
                />
                <span className="text-sm">{t("news.published")}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.featured}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, featured: e.target.checked }))
                  }
                />
                <span className="text-sm">{t("news.featured")}</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? t("news.saving") : editingId ? t("common.save") : t("news.create")}
            </button>
          </form>
        </Card>
      )}

      <div className="space-y-3">
        {news.map((item) => (
          <Card key={item.id} className="p-4 flex justify-between items-start gap-4">
            <div className="flex-1 space-y-2">
              <h3 className="font-bold">{item.title}</h3>
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="h-32 w-full max-w-md object-cover rounded-md border border-gray-200"
                />
              )}
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
                onClick={() => void handleDelete(item.id)}
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
