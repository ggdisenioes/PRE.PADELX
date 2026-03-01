"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import Card from "../Card";
import toast from "react-hot-toast";

type Comment = {
  id: number;
  user_name: string;
  content: string;
  created_at: string;
  user_id: string;
};

type CommentSectionProps = {
  entityType: "match" | "tournament" | "player";
  entityId: number;
};

export default function CommentSection({ entityType, entityId }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        setUserRole(profile?.role || null);
      }
    };

    initUser();
    fetchComments();
  }, [entityType, entityId]);

  const fetchComments = async () => {
    try {
      const response = await fetch(
        `/api/comments?entity_type=${entityType}&entity_id=${entityId}`
      );
      const result = await response.json();

      if (response.ok) {
        setComments(result.comments || []);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUserId) {
      toast.error("Debes iniciar sesión");
      return;
    }

    if (!newComment.trim()) {
      toast.error("El comentario no puede estar vacío");
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch("/api/comments", {
        method: "POST",
        headers,
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          content: newComment,
        }),
      });

      if (response.ok) {
        setNewComment("");
        toast.success("Comentario añadido");
        fetchComments();
      } else {
        toast.error("Error al añadir comentario");
      }
    } catch (error) {
      toast.error("Error");
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm("¿Eliminar comentario?")) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
        headers,
      });

      if (response.ok) {
        toast.success("Comentario eliminado");
        fetchComments();
      } else {
        toast.error("Error al eliminar");
      }
    } catch (error) {
      toast.error("Error");
    }
  };

  if (loading) {
    return <div className="text-center text-gray-500 py-4">Cargando comentarios...</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">💬 Comentarios ({comments.length})</h3>

      {currentUserId && (
        <form onSubmit={handleAddComment} className="space-y-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Añade un comentario..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            rows={3}
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            Comentar
          </button>
        </form>
      )}

      <div className="space-y-3">
        {comments.length === 0 ? (
          <Card className="p-4 text-center text-gray-500 text-sm">
            No hay comentarios aún
          </Card>
        ) : (
          comments.map((comment) => (
            <Card key={comment.id} className="p-4">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1">
                  <p className="font-semibold text-sm">{comment.user_name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(comment.created_at).toLocaleDateString("es-ES")}
                  </p>
                  <p className="text-sm mt-2">{comment.content}</p>
                </div>
                {(comment.user_id === currentUserId || userRole === "admin" || userRole === "manager") && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
