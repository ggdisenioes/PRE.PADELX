import { createClient } from '@supabase/supabase-js';
import type {
  Tenant,
  TenantAddon,
  SubscriptionPlan,
  Addon,
  SaaSMetrics,
  CreateTenantRequest,
  ManageAddonsRequest,
} from '@/lib/types/saas';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key"
);

export class TenantService {
  static async listTenants(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    status?: string
  ) {
    let query = supabase
      .from('tenants')
      .select('*, subscription_plans(name, price_eur)', { count: 'exact' });

    if (search) {
      query = query.or(`name.ilike.%${search}%,admin_email.ilike.%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, error, count } = await query;

    if (error) throw error;
    return { tenants: data as Tenant[], total: count || 0 };
  }

  static async getTenantById(id: string) {
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*, subscription_plans(id, name, price_eur, max_players)')
      .eq('id', id)
      .single();

    if (tenantError) throw tenantError;

    const { data: addons } = await supabase
      .from('tenant_addons')
      .select('*, addons(id, name, price_eur, billing_type)')
      .eq('tenant_id', id);

    return {
      ...tenant,
      addons: addons || [],
    };
  }

  static async createTenant(data: CreateTenantRequest) {
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + 14 * 24 * 60 * 60 * 1000);

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert([
        {
          name: data.name,
          admin_email: data.admin_email,
          phone: data.phone,
          country: data.country,
          subscription_plan_id: data.subscription_plan_id,
          status: 'trial',
          trial_started_at: trialStartedAt.toISOString(),
          trial_ends_at: trialEndsAt.toISOString(),
        },
      ])
      .select()
      .single();

    if (tenantError) throw tenantError;

    // Add add-ons if provided
    if (data.addon_ids && data.addon_ids.length > 0) {
      const addonRecords = data.addon_ids.map((addon_id) => ({
        tenant_id: tenant.id,
        addon_id,
        activated_at: new Date().toISOString(),
      }));

      const { error: addonError } = await supabase
        .from('tenant_addons')
        .insert(addonRecords);

      if (addonError) throw addonError;
    }

    return tenant;
  }

  static async updateTenantPlan(tenantId: string, planId: string) {
    const { data, error } = await supabase
      .from('tenants')
      .update({ subscription_plan_id: planId })
      .eq('id', tenantId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateTenantStatus(
    tenantId: string,
    status: 'trial' | 'active' | 'suspended' | 'cancelled'
  ) {
    const { data, error } = await supabase
      .from('tenants')
      .update({ status })
      .eq('id', tenantId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async addAddons(tenantId: string, addonIds: string[]) {
    const addonRecords = addonIds.map((addon_id) => ({
      tenant_id: tenantId,
      addon_id,
      activated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('tenant_addons').insert(addonRecords);

    if (error) throw error;
  }

  static async removeAddon(tenantId: string, addonId: string) {
    const { error } = await supabase
      .from('tenant_addons')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('addon_id', addonId);

    if (error) throw error;
  }

  static async checkPlayerLimit(tenantId: string, planId: string) {
    const { data: plan } = await supabase
      .from('subscription_plans')
      .select('max_players')
      .eq('id', planId)
      .single();

    if (!plan) throw new Error('Plan not found');

    const { data: usage } = await supabase
      .from('tenant_usage')
      .select('player_count')
      .eq('tenant_id', tenantId)
      .single();

    const currentPlayers = usage?.player_count || 0;
    return currentPlayers < plan.max_players;
  }
}

export class SubscriptionService {
  static async calculateMRR() {
    const { data: activeTenants, error } = await supabase
      .from('tenants')
      .select('subscription_plan_id, subscription_plans(price_eur)')
      .eq('status', 'active');

    if (error) throw error;

    const mrrFromPlans = (activeTenants || []).reduce((sum, tenant: any) => {
      return sum + (tenant.subscription_plans?.price_eur || 0);
    }, 0);

    const { data: addons } = await supabase
      .from('tenant_addons')
      .select('addons(price_eur, billing_type), tenant_id')
      .eq('addons.billing_type', 'monthly');

    let mrrFromAddons = 0;
    if (addons) {
      const activeTenantIds = new Set((activeTenants || []).map((t: any) => t.id));
      mrrFromAddons = (addons || []).reduce((sum, ta: any) => {
        if (activeTenantIds.has(ta.tenant_id)) {
          return sum + (ta.addons?.price_eur || 0);
        }
        return sum;
      }, 0);
    }

    return mrrFromPlans + mrrFromAddons;
  }

  static async calculateChurnRate(daysBack: number = 30) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    const { data: cancelledTenants } = await supabase
      .from('tenants')
      .select('id')
      .eq('status', 'cancelled')
      .gte('updated_at', sinceDate.toISOString());

    const { data: activeTenants } = await supabase
      .from('tenants')
      .select('id')
      .eq('status', 'active');

    const totalActive = (activeTenants || []).length;
    const totalCancelled = (cancelledTenants || []).length;

    if (totalActive === 0) return 0;
    return (totalCancelled / totalActive) * 100;
  }

  static async getPlanDistribution() {
    const { data: tenants } = await supabase
      .from('tenants')
      .select('subscription_plan_id, subscription_plans(name)')
      .eq('status', 'active');

    const distribution: Record<string, number> = {};
    (tenants || []).forEach((t: any) => {
      const planName = t.subscription_plans?.name || 'Unknown';
      distribution[planName] = (distribution[planName] || 0) + 1;
    });

    return distribution;
  }

  static async getAddonPopularity() {
    const { data: addonCounts } = await supabase
      .from('tenant_addons')
      .select('addon_id, addons(name)')
      .eq('tenants.status', 'active');

    const popularity: Record<string, number> = {};
    (addonCounts || []).forEach((ta: any) => {
      const addonName = ta.addons?.name || 'Unknown';
      popularity[addonName] = (popularity[addonName] || 0) + 1;
    });

    return Object.entries(popularity)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }
}

export class AnalyticsService {
  static async getMetrics(): Promise<SaaSMetrics> {
    const mrr = await SubscriptionService.calculateMRR();
    const arr = mrr * 12;

    const { count: activeTenants } = await supabase
      .from('tenants')
      .select('id', { count: 'exact' })
      .eq('status', 'active');

    const { count: trialTenants } = await supabase
      .from('tenants')
      .select('id', { count: 'exact' })
      .eq('status', 'trial');

    const churnRate = await SubscriptionService.calculateChurnRate();
    const planDistribution = await SubscriptionService.getPlanDistribution();
    const addonPopularity = await SubscriptionService.getAddonPopularity();

    return {
      mrr,
      arr,
      activeTenants: activeTenants || 0,
      trialTenants: trialTenants || 0,
      churnRate,
      planDistribution,
      addonPopularity,
    };
  }
}
