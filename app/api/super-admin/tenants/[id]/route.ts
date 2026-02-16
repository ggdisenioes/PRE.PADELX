import { NextRequest, NextResponse } from 'next/server';
import { TenantService, SubscriptionService } from '@/lib/services/saas.service';
import { UpdateTenantSchema, ChangeTenantPlanSchema, ChangeTenantStatusSchema, AddTenantAddonsSchema, RemoveTenantAddonSchema } from '@/lib/validation/saas.schema';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function verifySuperAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'super_admin') throw new Error('Forbidden');
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
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

    await verifySuperAdmin(supabase);

    const tenantService = new TenantService();
    const tenant = await tenantService.getTenantFull(id);

    return NextResponse.json({ data: tenant });
  } catch (error: any) {
    console.error('[GET /api/super-admin/tenants/[id]]', error);
    return NextResponse.json(
      { error: error.message },
      { status: error.message === 'Forbidden' ? 403 : 500 }
    );
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
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

    await verifySuperAdmin(supabase);

    // Si es cambio de plan
    if (body.subscription_plan_id) {
      ChangeTenantPlanSchema.parse(body);
      const tenantService = new TenantService();
      const updated = await tenantService.updateTenantPlan(id, body.subscription_plan_id);
      return NextResponse.json({ data: updated });
    }

    // Si es cambio de estado
    if (body.status) {
      ChangeTenantStatusSchema.parse(body);
      const tenantService = new TenantService();
      const updated = await tenantService.updateTenantStatus(id, body.status);
      return NextResponse.json({ data: updated });
    }

    // Otras actualizaciones
    const validated = UpdateTenantSchema.parse(body);
    const { error } = await supabase
      .from('tenants')
      .update({
        ...validated,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;

    const tenantService = new TenantService();
    const updated = await tenantService.getTenantFull(id);

    return NextResponse.json({ data: updated });
  } catch (error: any) {
    console.error('[PUT /api/super-admin/tenants/[id]]', error);
    return NextResponse.json(
      { error: error.message },
      { status: error.message === 'Forbidden' ? 403 : 500 }
    );
  }
}

/**
 * Manejar add-ons (POST y DELETE)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

    await verifySuperAdmin(supabase);

    const tenantService = new TenantService();

    // Agregar add-ons
    if (body.action === 'add_addons') {
      const validated = AddTenantAddonsSchema.parse(body);
      await tenantService.addAddonsToTenant(id, validated.addon_ids);
    }

    // Remover add-on
    if (body.action === 'remove_addon') {
      const validated = RemoveTenantAddonSchema.parse(body);
      await tenantService.removeAddonFromTenant(id, validated.addon_id);
    }

    const updated = await tenantService.getTenantFull(id);
    return NextResponse.json({ data: updated });
  } catch (error: any) {
    console.error('[PATCH /api/super-admin/tenants/[id]]', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
