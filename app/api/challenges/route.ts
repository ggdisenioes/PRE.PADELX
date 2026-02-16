import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sendChallengeNotification } from "@/lib/email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const challengeSchema = z.object({
  challenger_id: z.number().int().positive(),
  challenged_id: z.number().int().positive(),
  challenger_partner_id: z.number().int().positive().optional().nullable(),
  challenged_partner_id: z.number().int().positive().optional().nullable(),
  message: z.string().max(500).optional().nullable(),
});

const challengeUpdateSchema = z.object({
  status: z.enum(["pending", "accepted", "declined", "completed", "cancelled"]),
});

export async function GET(req: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    let query = supabaseClient
      .from("challenges")
      .select(
        "id, challenger_id, challenger_partner_id, challenged_id, challenged_partner_id, status, message, created_at, expires_at, match_id, challenged_accepted, challenged_partner_accepted, scheduled_date, scheduled_court, scheduled_place"
      )
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: challenges, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ challenges });
  } catch (error) {
    console.error("CHALLENGES GET ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado" },
        { status: 500 }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    const body = await req.json();
    const validated = challengeSchema.parse(body);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Validate challenger_id belongs to the authenticated user
    const { data: challengerPlayer } = await supabaseAdmin
      .from("players")
      .select("id, user_id")
      .eq("id", validated.challenger_id)
      .single();

    if (!challengerPlayer || challengerPlayer.user_id !== user.id) {
      return NextResponse.json(
        { error: "No puedes crear un desafío en nombre de otro jugador" },
        { status: 403 }
      );
    }

    const { data: challenge, error } = await supabaseAdmin
      .from("challenges")
      .insert({
        tenant_id: profile.tenant_id,
        challenger_id: validated.challenger_id,
        challenged_id: validated.challenged_id,
        challenger_partner_id: validated.challenger_partner_id || null,
        challenged_partner_id: validated.challenged_partner_id || null,
        message: validated.message || null,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    try {
      await supabaseAdmin.from("action_logs").insert({
        action: "CHALLENGE_CREATED",
        entity: "challenges",
        entity_id: challenge.id,
        user_id: user.id,
        user_email: user.email,
        metadata: {
          challenger_id: validated.challenger_id,
          challenged_id: validated.challenged_id,
        },
        tenant_id: profile.tenant_id,
      });
    } catch {
      // Silent fail
    }

    // Send email notifications (non-blocking)
    try {
      const playerIds = [
        validated.challenger_id,
        validated.challenged_id,
        validated.challenger_partner_id,
        validated.challenged_partner_id,
      ].filter((id): id is number => id != null);

      const { data: players } = await supabaseAdmin
        .from("players")
        .select("id, name, email, notify_email")
        .in("id", playerIds);

      if (players) {
        const getPlayer = (id: number | null | undefined) =>
          players.find((p: any) => p.id === id);

        const challenger = getPlayer(validated.challenger_id);
        const challengerPartner = getPlayer(validated.challenger_partner_id);
        const challenged = getPlayer(validated.challenged_id);
        const challengedPartner = getPlayer(validated.challenged_partner_id);

        const { data: tenant } = await supabaseAdmin
          .from("tenants")
          .select("name")
          .eq("id", profile.tenant_id)
          .single();

        await sendChallengeNotification({
          challengerName: challenger?.name || "Un jugador",
          challengerEmail: challenger?.notify_email !== false ? challenger?.email : null,
          challengerPartnerName: challengerPartner?.name,
          challengerPartnerEmail: challengerPartner?.notify_email !== false ? challengerPartner?.email : null,
          challengedName: challenged?.name || "Jugador",
          challengedEmail: challenged?.notify_email !== false ? challenged?.email : null,
          challengedPartnerName: challengedPartner?.name,
          challengedPartnerEmail: challengedPartner?.notify_email !== false ? challengedPartner?.email : null,
          message: validated.message,
          clubName: tenant?.name || "PadelX QA",
        });
      }
    } catch (notifError) {
      console.error("Notification error (non-blocking):", notifError);
    }

    return NextResponse.json({ success: true, challenge }, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }
    console.error("CHALLENGES POST ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
