"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Card from "../../components/Card";
import toast from "react-hot-toast";
import { z } from "zod";
import { useTranslation } from "@/i18n";
import { resolveNewsText } from "@/lib/newsPayload";

const DEFAULT_COVER = "/logo-fondo.png";

const newsSchema = z.object({
  title: z.string().min(1, "Titulo requerido"),
  content: z.string().min(1, "Contenido requerido"),
  published: z.boolean(),
  featured: z.boolean(),
  image_url: z.string().url().optional().or(z.literal("")),
  image_urls: z.array(z.string().url()),
});

type NewsFormState = z.infer<typeof newsSchema>;

type News = {
  id: number;
  title: string;
  content: string;
  published: boolean;
  featured: boolean;
  image_url: string | null;
  image_urls?: string[];
  title_i18n?: { es?: string; en?: string };
  content_i18n?: { es?: string; en?: string };
};

const emptyFormData = (): NewsFormState => ({
  title: "",
  content: "",
  published: false,
  featured: false,
  image_url: "",
  image_urls: [],
});

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });

const isValidImageFile = (file: File) => file.type.startsWith("image/");

const dedupeUrls = (urls: string[]) => {
  const set = new Set<string>();
  const out: string[] = [];
  for (const value of urls) {
    const clean = value.trim();
    if (!clean || set.has(clean)) continue;
    set.add(clean);
    out.push(clean);
  }
  return out;
};

export default function AdminNewsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useTranslation();
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<NewsFormState>(emptyFormData());
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [newGalleryFiles, setNewGalleryFiles] = useState<File[]>([]);
  const [newGalleryPreviews, setNewGalleryPreviews] = useState<string[]>([]);

  const requestedEditId = useMemo(() => {
    const raw = searchParams.get("edit");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }, [searchParams]);

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

  useEffect(() => {
    void checkAuth();
    void fetchNews();
  }, []);

  const labels = {
    title: t("admin.newsAdmin.title"),
    loading: t("admin.newsAdmin.loading"),
    createTitle:
      locale === "en" ? "Create / Edit News" : "Crear / Editar Noticia",
    titleField: locale === "en" ? "Title" : "Titulo",
    contentField: locale === "en" ? "Content" : "Contenido",
    coverImage: locale === "en" ? "Cover image" : "Imagen de portada",
    addImages: locale === "en" ? "Additional images" : "Imagenes adicionales",
    createButton: locale === "en" ? "Create" : "Crear",
    updateButton: locale === "en" ? "Update" : "Actualizar",
    newItem: locale === "en" ? "New article" : "Nueva noticia",
    cancel: locale === "en" ? "Cancel" : "Cancelar",
    removeImage: locale === "en" ? "Remove" : "Quitar",
    published: locale === "en" ? "Published" : "Publicado",
    featured: locale === "en" ? "Featured" : "Destacado",
    fallbackCover:
      locale === "en"
        ? "If no image is provided, Twinco logo will be used."
        : "Si no cargas imagen, se usa logo Twinco por defecto.",
    formats:
      locale === "en"
        ? "Supported: JPG, PNG, WEBP. Max 5MB each."
        : "Formatos: JPG, PNG, WEBP. Maximo 5MB cada una.",
    autoTranslateNote:
      locale === "en"
        ? "The app auto-translates this content to Spanish/English."
        : "La app traduce automaticamente este contenido a Español/Inglés.",
  };

  const resetForm = () => {
    setFormData(emptyFormData());
    setEditingId(null);
    setCoverFile(null);
    setCoverPreview("");
    setNewGalleryFiles([]);
    setNewGalleryPreviews([]);
  };

  const closeForm = () => {
    resetForm();
    setShowForm(false);
    if (requestedEditId !== null) router.replace("/admin/news");
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
      } else {
        toast.error(result.error || t("admin.newsAdmin.errorLoading"));
      }
    } catch (error) {
      console.error("Error fetching news:", error);
      toast.error(t("admin.newsAdmin.errorLoading"));
    } finally {
      setLoading(false);
    }
  };

  const handleCoverFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isValidImageFile(file)) {
      toast.error(locale === "en" ? "Image files only." : "Solo imagenes.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(locale === "en" ? "Max size is 5MB." : "El maximo es 5MB.");
      e.target.value = "";
      return;
    }

    setCoverFile(file);
    const preview = await fileToDataUrl(file);
    setCoverPreview(preview);
    e.target.value = "";
  };

  const handleGalleryFilesChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of files) {
      if (!isValidImageFile(file)) continue;
      if (file.size > 5 * 1024 * 1024) continue;
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      toast.error(locale === "en" ? "No valid images selected." : "No hay imagenes validas.");
      e.target.value = "";
      return;
    }

    const previews = await Promise.all(validFiles.map(fileToDataUrl));
    setNewGalleryFiles((prev) => [...prev, ...validFiles]);
    setNewGalleryPreviews((prev) => [...prev, ...previews]);
    e.target.value = "";
  };

  const removeExistingImage = (url: string) => {
    setFormData((prev) => ({
      ...prev,
      image_urls: prev.image_urls.filter((img) => img !== url),
      image_url: prev.image_url === url ? "" : prev.image_url,
    }));
    if (coverPreview === url) setCoverPreview("");
  };

  const removeNewGalleryImage = (index: number) => {
    setNewGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    setNewGalleryPreviews((prev) => prev.filter((_, i) => i !== index));
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

      let coverUrl = validated.image_url || "";
      if (coverFile) {
        coverUrl = await uploadNewsImage(coverFile);
      }

      const uploadedGallery = await Promise.all(
        newGalleryFiles.map((file) => uploadNewsImage(file))
      );

      let imageUrls = dedupeUrls([
        ...validated.image_urls,
        ...uploadedGallery,
      ]);

      if (coverUrl) {
        imageUrls = dedupeUrls([coverUrl, ...imageUrls]);
      }

      if (imageUrls.length === 0) {
        imageUrls = [DEFAULT_COVER];
        coverUrl = DEFAULT_COVER;
      } else if (!coverUrl) {
        coverUrl = imageUrls[0];
      }

      const payload = {
        title: validated.title,
        content: validated.content,
        source_locale: locale,
        image_url: coverUrl,
        image_urls: imageUrls,
        published: validated.published,
        featured: validated.featured,
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
      closeForm();
      await fetchNews();
    } catch (error: any) {
      toast.error(error?.message || t("news.errorSaving"));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: News) => {
    const currentLocale = locale === "en" ? "en" : "es";
    const localizedTitle = resolveNewsText(item.title_i18n, currentLocale, item.title);
    const localizedContent = resolveNewsText(item.content_i18n, currentLocale, item.content);
    const imageUrls = dedupeUrls(item.image_urls || (item.image_url ? [item.image_url] : []));
    const coverUrl = item.image_url || imageUrls[0] || "";
    const galleryUrls = imageUrls.filter((img) => img !== coverUrl);

    setFormData({
      title: localizedTitle,
      content: localizedContent,
      published: item.published,
      featured: item.featured,
      image_url: coverUrl,
      image_urls: galleryUrls,
    });
    setCoverFile(null);
    setCoverPreview(coverUrl);
    setNewGalleryFiles([]);
    setNewGalleryPreviews([]);
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
    } catch {
      toast.error(t("admin.newsAdmin.errorDeleting"));
    }
  };

  useEffect(() => {
    if (!requestedEditId || news.length === 0 || editingId === requestedEditId) return;
    const item = news.find((entry) => entry.id === requestedEditId);
    if (item) handleEdit(item);
  }, [editingId, news, requestedEditId]);

  if (loading) {
    return <div className="p-8 text-center">{labels.loading}</div>;
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{labels.title}</h1>
        <button
          onClick={() => {
            if (showForm) {
              closeForm();
              return;
            }
            resetForm();
            setShowForm(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showForm ? labels.cancel : `+ ${labels.newItem}`}
        </button>
      </div>

      {showForm && (
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">{labels.createTitle}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{labels.titleField}</label>
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
              <label className="block text-sm font-medium mb-1">{labels.contentField}</label>
              <textarea
                value={formData.content}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, content: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg h-40"
                required
              />
              <p className="text-xs text-gray-500 mt-1">{labels.autoTranslateNote}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">{labels.coverImage}</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleCoverFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <p className="text-xs text-gray-500">{labels.fallbackCover}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">{labels.addImages}</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleGalleryFilesChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <p className="text-xs text-gray-500">{labels.formats}</p>
            </div>

            {(coverPreview || formData.image_urls.length > 0 || newGalleryPreviews.length > 0) && (
              <div className="space-y-3">
                {coverPreview && (
                  <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-600">
                      {locale === "en" ? "Cover preview" : "Vista previa portada"}
                    </p>
                    <img
                      src={coverPreview}
                      alt="Cover"
                      className="h-40 w-full object-cover rounded-md"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCoverFile(null);
                        setCoverPreview("");
                        setFormData((prev) => ({ ...prev, image_url: "" }));
                      }}
                      className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      {labels.removeImage}
                    </button>
                  </div>
                )}

                {formData.image_urls.length > 0 && (
                  <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-600">
                      {locale === "en" ? "Saved images" : "Imagenes guardadas"}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {formData.image_urls.map((url) => (
                        <div key={url} className="space-y-1">
                          <img
                            src={url}
                            alt="Saved image"
                            className="h-24 w-full object-cover rounded-md border border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => removeExistingImage(url)}
                            className="w-full px-2 py-1 text-[11px] bg-gray-100 rounded hover:bg-gray-200"
                          >
                            {labels.removeImage}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {newGalleryPreviews.length > 0 && (
                  <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-600">
                      {locale === "en" ? "New images to upload" : "Imagenes nuevas a subir"}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {newGalleryPreviews.map((preview, index) => (
                        <div key={`${preview}-${index}`} className="space-y-1">
                          <img
                            src={preview}
                            alt={`New image ${index + 1}`}
                            className="h-24 w-full object-cover rounded-md border border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => removeNewGalleryImage(index)}
                            className="w-full px-2 py-1 text-[11px] bg-gray-100 rounded hover:bg-gray-200"
                          >
                            {labels.removeImage}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.published}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, published: e.target.checked }))
                  }
                />
                <span className="text-sm">{labels.published}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.featured}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, featured: e.target.checked }))
                  }
                />
                <span className="text-sm">{labels.featured}</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
            >
              {saving
                ? t("news.saving")
                : editingId
                  ? labels.updateButton
                  : labels.createButton}
            </button>
          </form>
        </Card>
      )}

      <div className="space-y-3">
        {news.map((item) => {
          const title = resolveNewsText(item.title_i18n, locale, item.title);
          const content = resolveNewsText(item.content_i18n, locale, item.content);

          return (
            <Card key={item.id} className="p-4 flex justify-between items-start gap-4">
              <div className="flex-1 space-y-2">
                <h3 className="font-bold">{title}</h3>
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={title}
                    className="h-32 w-full max-w-md object-cover rounded-md border border-gray-200"
                  />
                )}
                <p className="text-sm text-gray-600 line-clamp-2">{content}</p>
                <div className="flex gap-2 mt-2">
                  {item.published && (
                    <span className="text-xs px-2 py-1 bg-green-200 text-green-800 rounded">
                      {labels.published}
                    </span>
                  )}
                  {item.featured && (
                    <span className="text-xs px-2 py-1 bg-yellow-200 text-yellow-800 rounded">
                      {labels.featured}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(item)}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  {locale === "en" ? "Edit" : "Editar"}
                </button>
                <button
                  onClick={() => void handleDelete(item.id)}
                  className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                >
                  {locale === "en" ? "Delete" : "Eliminar"}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
