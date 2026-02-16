import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const bookingSchema = z.object({
  court_id: z.number().int().positive(),
  booking_date: z.string().refine((val) => !isNaN(Date.parse(val)), "Fecha inválida"),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Formato de hora inválido (HH:MM)"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "Formato de hora inválido (HH:MM)"),
  player_id: z.number().int().positive().optional().nullable(),
  notes: z.string().max(500).optional(),
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
    const date = searchParams.get("date");
    const courtId = searchParams.get("court_id");

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
      .from("bookings")
      .select(
        "id, court_id, booking_date, start_time, end_time, status, notes, user_id, created_at"
      )
      .eq("tenant_id", profile.tenant_id)
      .neq("status", "cancelled")
      .order("booking_date", { ascending: true });

    if (date) {
      query = query.eq("booking_date", date);
    }

    if (courtId) {
      query = query.eq("court_id", parseInt(courtId));
    }

    const { data: bookings, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bookings });
  } catch (error) {
    console.error("BOOKINGS GET ERROR:", error);
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
    const validated = bookingSchema.parse(body);

    // Validate time range
    const startHour = parseInt(validated.start_time.split(":")[0]);
    const endHour = parseInt(validated.end_time.split(":")[0]);

    if (startHour >= endHour) {
      return NextResponse.json(
        { error: "La hora de fin debe ser posterior a la hora de inicio" },
        { status: 400 }
      );
    }

    // Check availability
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: existingBooking } = await supabaseAdmin.rpc(
      "is_court_available",
      {
        court_id_input: validated.court_id,
        booking_date_input: validated.booking_date,
        start_time_input: validated.start_time,
        end_time_input: validated.end_time,
      }
    );

    if (existingBooking === false) {
      return NextResponse.json(
        { error: "La pista no está disponible en ese horario" },
        { status: 409 }
      );
    }

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        tenant_id: profile.tenant_id,
        court_id: validated.court_id,
        user_id: user.id,
        player_id: validated.player_id || null,
        booking_date: validated.booking_date,
        start_time: validated.start_time,
        end_time: validated.end_time,
        status: "confirmed",
        notes: validated.notes || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    try {
      await supabaseAdmin.from("action_logs").insert({
        action: "BOOKING_CREATED",
        entity: "bookings",
        entity_id: booking.id,
        user_id: user.id,
        user_email: user.email,
        metadata: {
          court_id: validated.court_id,
          booking_date: validated.booking_date,
        },
        tenant_id: profile.tenant_id,
      });
    } catch {
      // Silent fail
    }

    return NextResponse.json({ success: true, booking }, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }
    console.error("BOOKINGS POST ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
