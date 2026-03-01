export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { TenantService } from "@/lib/services/saas.service";
import {
  AddTenantAddonsSchema,
  ChangeTenantPlanSchema,
  ChangeTenantStatusSchema,
  RemoveTenantAddonSchema,
  UpdateTenantSchema,
} from "@/lib/validation/saas.schema";

type TenantStatus = "trial" | "active" | "suspended" | "cancelled";
type BillingEvent = "payment_failed" | "payment_recovered";

type PlanSummary = {
  id: string;
  name: string;
  price_eur: number;
  max_players: number;
  max_concurrent_tournaments: number;
  max_courts: number;
};

type UsageSnapshot = {
  playerCount: number;
  activeTournamentCount: number;
};

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

type InvoiceRow = {
  status: string | null;
  due_at: string | null;
  paid_at: string | null;
};

function getErrorMessage(error: unknown, fallback = "Error interno") {
  return error instanceof Error ? error.message : fallback;
}

function getSupabaseClient(useServiceRoleKey: boolean) {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    useServiceRoleKey
      ? process.env.SUPABASE_SERVICE_ROLE_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

async function verifySuperAdmin(
  supabase: SupabaseClient
): Promise<{ userId: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") throw new Error("Forbidden");
  return { userId: user.id };
}

async function getPlanById(
  supabase: SupabaseClient,
  planId: string
): Promise<PlanSummary> {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select(
      "id, name, price_eur, max_players, max_concurrent_tournaments, max_courts"
    )
    .eq("id", planId)
    .single();

  if (error || !data) throw new Error("Plan not found");
  return data as PlanSummary;
}

async function getLatestUsageSnapshot(
  supabase: SupabaseClient,
  tenantId: string
): Promise<UsageSnapshot> {
  const { data, error } = await supabase
    .from("tenant_usage")
    .select("player_count, active_tournament_count")
    .eq("tenant_id", tenantId)
    .order("measured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return {
    playerCount: data?.player_count ?? 0,
    activeTournamentCount: data?.active_tournament_count ?? 0,
  };
}

async function countOverdueInvoices(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .from("subscription_invoices")
    .select("status, due_at, paid_at")
    .eq("tenant_id", tenantId)
    .is("paid_at", null);

  if (error) throw error;

  const today = new Date().toISOString().slice(0, 10);
  return ((data || []) as InvoiceRow[]).filter((invoice) => {
    if (invoice.status === "overdue") return true;
    if (!invoice.due_at) return false;
    return invoice.due_at <= today;
  }).length;
}

function classifyPlanTransition(
  currentPlan: PlanSummary | null,
  nextPlan: PlanSummary
): "upgrade" | "downgrade" | "lateral" {
  if (!currentPlan) return "upgrade";

  const currentPrice = Number(currentPlan.price_eur || 0);
  const nextPrice = Number(nextPlan.price_eur || 0);

  const lowerLimits =
    nextPlan.max_players < currentPlan.max_players ||
    nextPlan.max_concurrent_tournaments <
      currentPlan.max_concurrent_tournaments ||
    nextPlan.max_courts < currentPlan.max_courts;

  const higherLimits =
    nextPlan.max_players > currentPlan.max_players ||
    nextPlan.max_concurrent_tournaments >
      currentPlan.max_concurrent_tournaments ||
    nextPlan.max_courts > currentPlan.max_courts;

  if (nextPrice < currentPrice || lowerLimits) return "downgrade";
  if (nextPrice > currentPrice || higherLimits) return "upgrade";
  return "lateral";
}

function getDowngradeViolations(nextPlan: PlanSummary, usage: UsageSnapshot) {
  const violations: Array<{ metric: string; current: number; allowed: number }> =
    [];

  if (usage.playerCount > nextPlan.max_players) {
    violations.push({
      metric: "players",
      current: usage.playerCount,
      allowed: nextPlan.max_players,
    });
  }

  if (usage.activeTournamentCount > nextPlan.max_concurrent_tournaments) {
    violations.push({
      metric: "active_tournaments",
      current: usage.activeTournamentCount,
      allowed: nextPlan.max_concurrent_tournaments,
    });
  }

  return violations;
}

async function logSuperAdminAction(
  supabase: SupabaseClient,
  input: {
  userId: string;
  tenantId: string;
  action: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}
) {
  try {
    await supabase.from("super_admin_action_logs").insert({
      super_admin_user_id: input.userId,
      tenant_id: input.tenantId,
      action: input.action,
      entity_type: "tenant",
      entity_id: input.tenantId,
      old_values: input.oldValues ?? null,
      new_values: input.newValues ?? null,
    });
  } catch (error) {
    console.warn("[super-admin action log] non-blocking error", error);
  }
}

/**
 * GET /api/super-admin/tenants/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient(false);

    await verifySuperAdmin(supabase);

    const tenant = await TenantService.getTenantById(id);
    return NextResponse.json({ data: tenant });
  } catch (error: unknown) {
    console.error("[GET /api/super-admin/tenants/[id]]", error);
    const message = getErrorMessage(error);
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/super-admin/tenants/[id]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseClient(true);
    const { userId } = await verifySuperAdmin(supabase);

    const currentTenant = await TenantService.getTenantById(id);

    // Explicit plan transition flow (upgrade/downgrade/lateral)
    if (body.subscription_plan_id) {
      const parsed = ChangeTenantPlanSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.errors[0]?.message || "Validación fallida" },
          { status: 400 }
        );
      }

      const nextPlan = await getPlanById(supabase, parsed.data.subscription_plan_id);
      const currentPlan = currentTenant.subscription_plan_id
        ? await getPlanById(supabase, currentTenant.subscription_plan_id)
        : null;
      const usage = await getLatestUsageSnapshot(supabase, id);
      const transition = classifyPlanTransition(currentPlan, nextPlan);

      if (transition === "downgrade") {
        const violations = getDowngradeViolations(nextPlan, usage);
        if (violations.length > 0) {
          return NextResponse.json(
            {
              error:
                "No se puede aplicar el downgrade porque el uso actual supera los límites del nuevo plan.",
              code: "BILLING_DOWNGRADE_BLOCKED",
              transition,
              usage,
              violations,
            },
            { status: 409 }
          );
        }
      }

      const nowIso = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        subscription_plan_id: nextPlan.id,
        updated_at: nowIso,
      };

      if (transition === "upgrade" && body.activate_on_upgrade === true) {
        const currentStatus = currentTenant.status as TenantStatus;
        if (currentStatus === "trial" || currentStatus === "suspended") {
          updatePayload.status = "active";
          updatePayload.subscription_ends_at = null;
          if (!currentTenant.subscription_started_at) {
            updatePayload.subscription_started_at = nowIso;
          }
        }
      }

      const { error: updateError } = await supabase
        .from("tenants")
        .update(updatePayload)
        .eq("id", id);

      if (updateError) throw updateError;

      await logSuperAdminAction(supabase, {
        userId,
        tenantId: id,
        action: `tenant_plan_${transition}`,
        oldValues: {
          subscription_plan_id: currentTenant.subscription_plan_id,
          status: currentTenant.status,
        },
        newValues: {
          subscription_plan_id: nextPlan.id,
          activate_on_upgrade: Boolean(body.activate_on_upgrade),
        },
      });

      const updated = await TenantService.getTenantById(id);
      return NextResponse.json({
        data: updated,
        billing: {
          transition,
          usage,
        },
      });
    }

    // Explicit status/payment flow
    if (body.status || body.billing_event) {
      const BillingStatusSchema = z.object({
        status: z.enum(["trial", "active", "suspended", "cancelled"]).optional(),
        billing_event: z.enum(["payment_failed", "payment_recovered"]).optional(),
        force: z.boolean().optional(),
        reason: z.string().max(255).optional(),
      });

      const parsedStatus = BillingStatusSchema.safeParse(body);
      if (!parsedStatus.success) {
        return NextResponse.json(
          { error: parsedStatus.error.errors[0]?.message || "Validación fallida" },
          { status: 400 }
        );
      }

      if (parsedStatus.data.status) {
        const statusValidation = ChangeTenantStatusSchema.safeParse({
          status: parsedStatus.data.status,
        });
        if (!statusValidation.success) {
          return NextResponse.json(
            {
              error:
                statusValidation.error.errors[0]?.message || "Estado inválido",
            },
            { status: 400 }
          );
        }
      }

      const billingEvent = parsedStatus.data.billing_event as BillingEvent | undefined;
      const targetStatus = (parsedStatus.data.status ||
        (billingEvent === "payment_failed"
          ? "suspended"
          : billingEvent === "payment_recovered"
          ? "active"
          : undefined)) as TenantStatus | undefined;

      if (!targetStatus) {
        return NextResponse.json(
          { error: "Debe enviar status o billing_event" },
          { status: 400 }
        );
      }

      if (targetStatus === "active" && !parsedStatus.data.force) {
        const overdueCount = await countOverdueInvoices(supabase, id);
        if (overdueCount > 0) {
          return NextResponse.json(
            {
              error:
                "No se puede activar el tenant mientras existan facturas vencidas. Usa force=true si querés forzar la reactivación.",
              code: "BILLING_OVERDUE_INVOICES",
              overdue_invoices: overdueCount,
            },
            { status: 409 }
          );
        }
      }

      const nowIso = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        status: targetStatus,
        updated_at: nowIso,
      };

      if (targetStatus === "active") {
        updatePayload.subscription_ends_at = null;
        if (!currentTenant.subscription_started_at) {
          updatePayload.subscription_started_at = nowIso;
        }
      }

      if (targetStatus === "suspended" && billingEvent === "payment_failed") {
        updatePayload.subscription_ends_at = nowIso;
      }

      if (targetStatus === "cancelled") {
        updatePayload.subscription_ends_at = nowIso;
      }

      const { error: updateError } = await supabase
        .from("tenants")
        .update(updatePayload)
        .eq("id", id);

      if (updateError) throw updateError;

      await logSuperAdminAction(supabase, {
        userId,
        tenantId: id,
        action: `tenant_status_${targetStatus}`,
        oldValues: {
          status: currentTenant.status,
        },
        newValues: {
          status: targetStatus,
          billing_event: billingEvent || null,
          reason: parsedStatus.data.reason || null,
          force: Boolean(parsedStatus.data.force),
        },
      });

      const updated = await TenantService.getTenantById(id);
      return NextResponse.json({ data: updated });
    }

    // Generic tenant profile update
    const validated = UpdateTenantSchema.parse(body);
    const { error } = await supabase
      .from("tenants")
      .update({
        ...validated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    const updated = await TenantService.getTenantById(id);
    return NextResponse.json({ data: updated });
  } catch (error: unknown) {
    console.error("[PUT /api/super-admin/tenants/[id]]", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Validación fallida" },
        { status: 400 }
      );
    }

    const message = getErrorMessage(error);
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/super-admin/tenants/[id]
 * Manage add-ons
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseClient(true);
    const { userId } = await verifySuperAdmin(supabase);

    if (body.action === "add_addons") {
      const validated = AddTenantAddonsSchema.parse(body);
      const uniqueAddonIds = Array.from(new Set(validated.addon_ids));

      const { data: existing, error: existingError } = await supabase
        .from("tenant_addons")
        .select("addon_id")
        .eq("tenant_id", id)
        .in("addon_id", uniqueAddonIds);

      if (existingError) throw existingError;

      const existingSet = new Set(
        (existing || []).map((row: { addon_id: string }) => row.addon_id)
      );

      const rowsToInsert = uniqueAddonIds
        .filter((addonId) => !existingSet.has(addonId))
        .map((addonId) => ({
          tenant_id: id,
          addon_id: addonId,
          activated_at: new Date().toISOString(),
        }));

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("tenant_addons")
          .insert(rowsToInsert);
        if (insertError) throw insertError;
      }

      await logSuperAdminAction(supabase, {
        userId,
        tenantId: id,
        action: "tenant_addons_add",
        newValues: {
          addon_ids: uniqueAddonIds,
        },
      });
    } else if (body.action === "remove_addon") {
      const validated = RemoveTenantAddonSchema.parse(body);
      await TenantService.removeAddon(id, validated.addon_id);

      await logSuperAdminAction(supabase, {
        userId,
        tenantId: id,
        action: "tenant_addon_remove",
        oldValues: {
          addon_id: validated.addon_id,
        },
      });
    } else {
      return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
    }

    const updated = await TenantService.getTenantById(id);
    return NextResponse.json({ data: updated });
  } catch (error: unknown) {
    console.error("[PATCH /api/super-admin/tenants/[id]]", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Validación fallida" },
        { status: 400 }
      );
    }

    const message = getErrorMessage(error);
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
