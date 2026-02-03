"use client";

import { useRef } from "react";
import { toPng } from "html-to-image";
import MatchShareCard from "./MatchShareCard";

type Props = {
  open: boolean;
  onClose: () => void;
  winnerTeam: string;
  loserTeam: string;
  score: string;
  isAdmin: boolean;
  onEdit?: () => void;
};

export default function MatchResultModal({
  open,
  onClose,
  winnerTeam,
  loserTeam,
  score,
  isAdmin,
  onEdit,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    const dataUrl = await toPng(cardRef.current, {
      cacheBust: true,
      pixelRatio: 2,
    });

    const link = document.createElement("a");
    link.download = "resultado-partido.png";
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-sm w-full p-4 space-y-4">
        <MatchShareCard
          ref={cardRef}
          winnerTeam={winnerTeam}
          loserTeam={loserTeam}
          score={score}
        />

        <div className="flex flex-col gap-2">
          <button
            onClick={handleDownload}
            className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700"
          >
            Descargar imagen
          </button>

          {isAdmin && onEdit && (
            <button
              onClick={onEdit}
              className="w-full bg-yellow-500 text-white py-2 rounded-lg font-semibold hover:bg-yellow-600"
            >
              Editar resultado
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full border py-2 rounded-lg"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}