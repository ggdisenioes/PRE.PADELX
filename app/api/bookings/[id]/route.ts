import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const bookingUpdateSchema = z.object({
  status: z.enum(["confirmed", "cancelled", "completed"]).optional(),
  notes: z.string().max(500).optional(),
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
    const bookingId = parseInt(id, 10);

    if (isNaN(bookingId)) {
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

    // Get user's profile (tenant + role)
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Check booking exists and belongs to same tenant
    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("user_id, tenant_id")
      .eq("id", bookingId)
      .single();

    if (!booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    if (booking.tenant_id !== profile.tenant_id) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    const canUpdate =
      booking.user_id === user.id ||
      profile.role === "admin" || profile.role === "manager";

    if (!canUpdate) {
      return NextResponse.json(
        { error: "No puedes editar esta reserva" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = bookingUpdateSchema.parse(body);

    const { data: updatedBooking, error } = await supabaseAdmin
      .from("bookings")
      .update(validated)
      .eq("id", bookingId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    try {
      await supabaseAdmin.from("action_logs").insert({
        action: "BOOKING_UPDATED",
        entity: "bookings",
        entity_id: bookingId,
        user_id: user.id,
        user_email: user.email,
        metadata: validated,
      });
    } catch {
      // Silent fail
    }

    return NextResponse.json({ success: true, booking: updatedBooking });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }
    console.error("BOOKING PUT ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
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
    const bookingId = parseInt(id, 10);

    if (isNaN(bookingId)) {
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

    // Get user's profile (tenant + role)
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Check booking exists and belongs to same tenant
    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("user_id, tenant_id")
      .eq("id", bookingId)
      .single();

    if (!booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    if (booking.tenant_id !== profile.tenant_id) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    const canDelete =
      booking.user_id === user.id ||
      profile.role === "admin" || profile.role === "manager";

    if (!canDelete) {
      return NextResponse.json(
        { error: "No puedes eliminar esta reserva" },
        { status: 403 }
      );
    }

    // Set status to cancelled instead of hard delete
    const { error } = await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("BOOKING DELETE ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
