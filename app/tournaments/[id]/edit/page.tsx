"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function LegacyTournamentEditRedirect() {
  const router = useRouter();
  const params = useParams();
  const rawId = (params as any)?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  useEffect(() => {
    const idNumber = Number(id);
    if (!id || Number.isNaN(idNumber) || idNumber <= 0) {
      router.replace("/tournaments");
      return;
    }
    router.replace(`/tournaments/edit/${idNumber}`);
  }, [id, router]);

  return (
    <main className="max-w-xl mx-auto p-6">
      <p className="text-sm text-gray-500">Redirigiendo a la edicion completa del torneo...</p>
    </main>
  );
}
