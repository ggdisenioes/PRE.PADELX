export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CreateTournamentBody = {
  name?: string;
  category?: string;
  status?: string;
  start_date?: string | null;
  rounds?: Array<{
    round_number?: number;
    round_name?: string;
    start_at?: string;
  }>;
};

const ALLOWED_ROLES = new Set(["admin", "manager", "super_admin"]);
const ALLOWED_STATUSES = new Set([
  "open",
  "ongoing",
  "finished",
  "abierto",
  "en_curso",
  "finalizado",
  "proximo",
]);

export async function POST(request: NextRequest) {
  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: userData, error: userError } = await adminClient.auth.getUser(
      token
    );
    const user = userData?.user;
    if (userError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, active, tenant_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "No se pudo validar el perfil del usuario." },
        { status: 403 }
      );
    }

    if (!profile.active) {
      return NextResponse.json({ error: "Usuario inactivo." }, { status: 403 });
    }

    if (!ALLOWED_ROLES.has(String(profile.role || "").toLowerCase())) {
      return NextResponse.json(
        { error: "No tienes permisos para crear torneos." },
        { status: 403 }
      );
    }

    if (!profile.tenant_id) {
      return NextResponse.json(
        { error: "Tu usuario no tiene tenant asignado." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as CreateTournamentBody;

    const name = (body.name || "").trim();
    const category = (body.category || "").trim();
    const status = (body.status || "").trim();
    const startDate = body.start_date || null;
    const roundsInput = Array.isArray(body.rounds) ? body.rounds : [];

    if (!name) {
      return NextResponse.json(
        { error: "Introduce un nombre para el torneo." },
        { status: 400 }
      );
    }

    if (!category) {
      return NextResponse.json(
        { error: "Introduce una categoría válida." },
        { status: 400 }
      );
    }

    if (!status || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "Estado de torneo inválido." },
        { status: 400 }
      );
    }

    if (roundsInput.length > 40) {
      return NextResponse.json(
        { error: "Máximo 40 jornadas por torneo." },
        { status: 400 }
      );
    }

    const normalizedRounds = roundsInput
      .map((round, index) => {
        const parsedNumber = Number(round.round_number);
        const roundNumber = Number.isFinite(parsedNumber) && parsedNumber > 0
          ? Math.trunc(parsedNumber)
          : index + 1;

        const startAtRaw = String(round.start_at || "").trim();
        if (!startAtRaw) {
          return { error: `Falta la fecha de inicio de la jornada ${roundNumber}.` } as const;
        }

        const parsedStartAt = new Date(startAtRaw);
        if (Number.isNaN(parsedStartAt.getTime())) {
          return { error: `Fecha inválida en la jornada ${roundNumber}.` } as const;
        }

        const roundName = String(round.round_name || "").trim() || `Fecha ${roundNumber}`;

        return {
          round_number: roundNumber,
          round_name: roundName,
          start_at: parsedStartAt.toISOString(),
        } as const;
      })
      .sort((a, b) => {
        if ("error" in a || "error" in b) return 0;
        return a.round_number - b.round_number;
      });

    const roundErrorItem = normalizedRounds.find(
      (round): round is { error: string } => "error" in round
    );
    if (roundErrorItem) {
      return NextResponse.json({ error: roundErrorItem.error }, { status: 400 });
    }

    const roundNumbers = new Set<number>();
    for (const round of normalizedRounds) {
      if (roundNumbers.has(round.round_number)) {
        return NextResponse.json(
          { error: "Las jornadas no pueden tener números repetidos." },
          { status: 400 }
        );
      }
      roundNumbers.add(round.round_number);
    }

    const normalizedRoundsSafe = normalizedRounds as Array<{
      round_number: number;
      round_name: string;
      start_at: string;
    }>;

    const effectiveStartDate =
      startDate ||
      (normalizedRoundsSafe.length > 0
        ? normalizedRoundsSafe[0].start_at.slice(0, 10)
        : null);

    const payload = {
      name,
      category,
      status,
      start_date: effectiveStartDate,
      tenant_id: profile.tenant_id,
    };

    const { data, error } = await adminClient
      .from("tournaments")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      const message = error.message?.includes("PLAN_LIMIT")
        ? error.message.replace("PLAN_LIMIT: ", "")
        : error.message || "Error al crear el torneo.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (normalizedRoundsSafe.length > 0) {
      const roundsPayload = normalizedRoundsSafe.map((round) => ({
        tournament_id: Number(data.id),
        tenant_id: profile.tenant_id,
        round_number: round.round_number,
        round_name: round.round_name,
        start_at: round.start_at,
        created_by: user.id,
      }));

      const { error: roundsError } = await adminClient
        .from("tournament_rounds")
        .insert(roundsPayload);

      if (roundsError) {
        await adminClient.from("tournaments").delete().eq("id", data.id);
        return NextResponse.json(
          { error: roundsError.message || "No se pudieron crear las jornadas del torneo." },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
