export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_eur: number;
  max_players: number;
  max_concurrent_tournaments: number;
  max_courts: number;
  has_advanced_rankings: boolean;
  has_mobile_app: boolean;
  support_level: 'email' | 'priority' | 'premium';
  support_response_hours: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Addon {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_eur: number;
  icon?: string;
  billing_type: 'monthly' | 'one_time';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  admin_email: string;
  phone?: string;
  country?: string;
  subscription_plan_id: string;
  status: 'trial' | 'active' | 'suspended' | 'cancelled';
  trial_started_at: string;
  trial_ends_at: string;
  created_at: string;
  updated_at: string;
  subscription_plan?: SubscriptionPlan;
}

export interface TenantAddon {
  id: string;
  tenant_id: string;
  addon_id: string;
  activated_at: string;
  created_at: string;
  addon?: Addon;
}

export interface TenantUsage {
  id: string;
  tenant_id: string;
  player_count: number;
  active_tournament_count: number;
  court_count: number;
  last_updated: string;
}

export interface SubscriptionInvoice {
  id: string;
  tenant_id: string;
  total_price: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  period_start: string;
  period_end: string;
  issued_at: string;
  due_date: string;
  paid_at?: string;
  created_at: string;
}

export interface SaaSMetrics {
  mrr: number;
  arr: number;
  activeTenants: number;
  trialTenants: number;
  churnRate: number;
  planDistribution: Record<string, number>;
  addonPopularity: Array<{ name: string; count: number }>;
}

export interface CreateTenantRequest {
  name: string;
  admin_email: string;
  phone?: string;
  country?: string;
  subscription_plan_id: string;
  addon_ids?: string[];
}

export interface UpdateTenantRequest {
  subscription_plan_id?: string;
  status?: 'trial' | 'active' | 'suspended' | 'cancelled';
}

export interface ManageAddonsRequest {
  addon_ids: string[];
}
