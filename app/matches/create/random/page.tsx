"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LegacyCreateRandomMatchesRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tournamentId = searchParams.get("tournament");

  useEffect(() => {
    const idNumber = Number(tournamentId);
    if (!tournamentId || Number.isNaN(idNumber) || idNumber <= 0) {
      router.replace("/matches/create");
      return;
    }
    router.replace(`/tournaments/${idNumber}/generate-matches`);
  }, [router, tournamentId]);

  return (
    <main className="max-w-xl mx-auto p-6">
      <p className="text-sm text-gray-500">Redirigiendo al generador de partidos...</p>
    </main>
  );
}
