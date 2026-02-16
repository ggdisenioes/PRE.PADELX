import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sendMatchProposalNotification } from "@/lib/email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const respondSchema = z.object({
  action: z.literal("respond"),
  player_id: z.number().int().positive(),
  response: z.enum(["accept", "decline"]),
});

const scheduleSchema = z.object({
  action: z.literal("schedule"),
  date: z.string(),
  court: z.string().optional(),
  place: z.string().optional(),
});

const legacyUpdateSchema = z.object({
  status: z.enum(["pending", "accepted", "declined", "completed", "cancelled"]),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado" },
        { status: 500 }
      );
    }

    const { id } = await params;
    const challengeId = parseInt(id, 10);

    if (isNaN(challengeId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Get full challenge details
    const { data: challenge } = await supabaseAdmin
      .from("challenges")
      .select("*")
      .eq("id", challengeId)
      .single();

    if (!challenge) {
      return NextResponse.json({ error: "Desafío no encontrado" }, { status: 404 });
    }

    // Verify user belongs to the same tenant
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.tenant_id !== challenge.tenant_id) {
      return NextResponse.json(
        { error: "No tienes acceso a este desafío" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Route: individual response
    if (body.action === "respond") {
      const validated = respondSchema.parse(body);

      if (challenge.status !== "pending") {
        return NextResponse.json(
          { error: "Este desafío ya no está pendiente" },
          { status: 400 }
        );
      }

      // Validate the authenticated user owns this player_id
      const { data: respondingPlayer } = await supabaseAdmin
        .from("players")
        .select("id, user_id")
        .eq("id", validated.player_id)
        .single();

      if (!respondingPlayer || respondingPlayer.user_id !== user.id) {
        return NextResponse.json(
          { error: "No puedes responder en nombre de otro jugador" },
          { status: 403 }
        );
      }

      // Determine which field to update
      let updateField: string;
      if (validated.player_id === challenge.challenged_id) {
        updateField = "challenged_accepted";
      } else if (validated.player_id === challenge.challenged_partner_id) {
        updateField = "challenged_partner_accepted";
      } else {
        return NextResponse.json(
          { error: "Este jugador no es un retado en este desafío" },
          { status: 403 }
        );
      }

      const accepted = validated.response === "accept";
      const updateData: Record<string, any> = { [updateField]: accepted };

      // Calculate new overall status
      const currentChallengedAccepted =
        updateField === "challenged_accepted" ? accepted : challenge.challenged_accepted;
      const currentPartnerAccepted =
        updateField === "challenged_partner_accepted" ? accepted : challenge.challenged_partner_accepted;

      // If either declined → status = declined
      if (currentChallengedAccepted === false || currentPartnerAccepted === false) {
        updateData.status = "declined";
      }
      // If both accepted (partner required only when challenged_partner_id exists)
      else if (
        currentChallengedAccepted === true &&
        (!challenge.challenged_partner_id || currentPartnerAccepted === true)
      ) {
        updateData.status = "accepted";
      }

      const { data: updated, error } = await supabaseAdmin
        .from("challenges")
        .update(updateData)
        .eq("id", challengeId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Audit log
      try {
        await supabaseAdmin.from("action_logs").insert({
          action: `CHALLENGE_${validated.response.toUpperCase()}`,
          entity: "challenges",
          entity_id: challengeId,
          user_id: user.id,
          user_email: user.email,
          tenant_id: challenge.tenant_id,
          metadata: { player_id: validated.player_id, response: validated.response },
        });
      } catch {
        // Silent fail
      }

      return NextResponse.json({ success: true, challenge: updated });
    }

    // Route: propose match from accepted challenge (notifies admin/manager)
    if (body.action === "schedule") {
      const validated = scheduleSchema.parse(body);

      if (challenge.status !== "accepted") {
        return NextResponse.json(
          { error: "El desafío debe estar aceptado para proponer un partido" },
          { status: 400 }
        );
      }

      if (challenge.scheduled_date) {
        return NextResponse.json(
          { error: "Ya se envió una propuesta de partido para este desafío" },
          { status: 400 }
        );
      }

      const scheduledDate = new Date(validated.date);

      // Save proposed schedule on the challenge
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("challenges")
        .update({
          scheduled_date: scheduledDate.toISOString(),
          scheduled_court: validated.court || null,
          scheduled_place: validated.place || null,
        })
        .eq("id", challengeId)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // Audit log
      try {
        await supabaseAdmin.from("action_logs").insert({
          action: "CHALLENGE_MATCH_PROPOSED",
          entity: "challenges",
          entity_id: challengeId,
          user_id: user.id,
          user_email: user.email,
          tenant_id: challenge.tenant_id,
          metadata: { date: validated.date, court: validated.court, place: validated.place },
        });
      } catch {
        // Silent fail
      }

      // Notify tenant admins/managers (non-blocking)
      try {
        const playerIds = [
          challenge.challenger_id,
          challenge.challenger_partner_id,
          challenge.challenged_id,
          challenge.challenged_partner_id,
        ].filter((id): id is number => id != null);

        const { data: playerNames } = await supabaseAdmin
          .from("players")
          .select("id, name")
          .in("id", playerIds);

        const getName = (id: number | null) =>
          playerNames?.find((p: any) => p.id === id)?.name || "—";

        const teamA = `${getName(challenge.challenger_id)} y ${getName(challenge.challenger_partner_id)}`;
        const teamB = `${getName(challenge.challenged_id)} y ${getName(challenge.challenged_partner_id)}`;

        const matchDate = new Intl.DateTimeFormat("es-ES", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Madrid",
        }).format(scheduledDate);

        const courtText = [validated.court, validated.place].filter(Boolean).join(" · ") || undefined;

        const { data: tenant } = await supabaseAdmin
          .from("tenants")
          .select("name")
          .eq("id", challenge.tenant_id)
          .single();

        // Get admin/manager emails for this tenant + super_admins
        const { data: tenantAdmins } = await supabaseAdmin
          .from("profiles")
          .select("email, first_name")
          .eq("tenant_id", challenge.tenant_id)
          .in("role", ["admin", "manager"]);

        const { data: superAdmins } = await supabaseAdmin
          .from("profiles")
          .select("email, first_name")
          .eq("role", "super_admin");

        const allAdmins = [...(tenantAdmins || []), ...(superAdmins || [])];
        const adminEmails = allAdmins
          .filter((a: any) => a.email)
          .map((a: any) => ({ name: a.first_name || "Admin", email: a.email }));

        if (adminEmails.length > 0) {
          await sendMatchProposalNotification({
            adminEmails,
            teamA,
            teamB,
            matchDate,
            court: courtText,
            clubName: tenant?.name || "PadelX QA",
          });
        }
      } catch (notifError) {
        console.error("Notification error (non-blocking):", notifError);
      }

      return NextResponse.json({ success: true, challenge: updated });
    }

    // Legacy: direct status update (for admin/cancel)
    const validated = legacyUpdateSchema.parse(body);

    const { data: updatedChallenge, error } = await supabaseAdmin
      .from("challenges")
      .update({ status: validated.status })
      .eq("id", challengeId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    try {
      await supabaseAdmin.from("action_logs").insert({
        action: `CHALLENGE_${validated.status.toUpperCase()}`,
        entity: "challenges",
        entity_id: challengeId,
        user_id: user.id,
        user_email: user.email,
        tenant_id: challenge.tenant_id,
        metadata: { status: validated.status },
      });
    } catch {
      // Silent fail
    }

    return NextResponse.json({ success: true, challenge: updatedChallenge });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }
    console.error("CHALLENGE PUT ERROR:", error);
    return NextResponse.json({ error: error?.message || "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado" },
        { status: 500 }
      );
    }

    const { id } = await params;
    const challengeId = parseInt(id, 10);

    if (isNaN(challengeId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Get challenge and verify permission
    const { data: challenge } = await supabaseClient
      .from("challenges")
      .select("challenger_id, tenant_id")
      .eq("id", challengeId)
      .single();

    if (!challenge) {
      return NextResponse.json({ error: "Desafío no encontrado" }, { status: 404 });
    }

    // Verify user belongs to the same tenant as the challenge
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.tenant_id !== challenge.tenant_id) {
      return NextResponse.json(
        { error: "No tienes acceso a este desafío" },
        { status: 403 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { error } = await supabaseAdmin
      .from("challenges")
      .delete()
      .eq("id", challengeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("CHALLENGE DELETE ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
