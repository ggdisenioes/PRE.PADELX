"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getClientCache, setClientCache } from "../lib/clientCache";

type PlanInfo = {
  id: string;
  name: string;
  slug: string;
  max_players: number;
  max_concurrent_tournaments: number;
  max_courts: number;
  has_advanced_rankings: boolean;
  has_player_stats: boolean;
  has_leagues: boolean;
  has_online_registration: boolean;
  has_api_access: boolean;
  has_mobile_app: boolean;
  has_live_scoring: boolean;
  has_white_label: boolean;
  has_integrations: boolean;
};

type TenantPlanResult = {
  loading: boolean;
  plan: PlanInfo | null;
  addonSlugs: string[];
  usage: {
    playerCount: number;
    activeTournamentCount: number;
  };
  canCreatePlayer: boolean;
  canCreateTournament: boolean;
  hasFeature: (key: string) => boolean;
};

type TenantPlanCachePayload = {
  plan: PlanInfo | null;
  addonSlugs: string[];
  usage: {
    playerCount: number;
    activeTournamentCount: number;
  };
};

type AddonJoinRow = {
  addons?: { slug?: string | null } | Array<{ slug?: string | null }> | null;
};

const PLAN_BOOLEAN_KEYS = [
  "has_advanced_rankings",
  "has_player_stats",
  "has_leagues",
  "has_online_registration",
  "has_api_access",
  "has_mobile_app",
  "has_live_scoring",
  "has_white_label",
  "has_integrations",
] as const;

const TENANT_PLAN_CACHE_PREFIX = "qa:tenant-plan:v1";
const TENANT_PLAN_CACHE_TTL_MS = 2 * 60 * 1000;

export function useTenantPlan(): TenantPlanResult {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [addonSlugs, setAddonSlugs] = useState<string[]>([]);
  const [usage, setUsage] = useState({ playerCount: 0, activeTournamentCount: 0 });

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          if (active) setLoading(false);
          return;
        }

        const cacheKey = `${TENANT_PLAN_CACHE_PREFIX}:${session.user.id}`;
        const cached = getClientCache<TenantPlanCachePayload>(
          cacheKey,
          TENANT_PLAN_CACHE_TTL_MS
        );

        if (cached && active) {
          setPlan(cached.plan || null);
          setAddonSlugs(cached.addonSlugs || []);
          setUsage({
            playerCount: cached.usage?.playerCount || 0,
            activeTournamentCount: cached.usage?.activeTournamentCount || 0,
          });
          setLoading(false);
        }

        // 1) Get tenant_id from profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("tenant_id")
          .eq("id", session.user.id)
          .single();

        if (!profile?.tenant_id) {
          if (active) setLoading(false);
          return;
        }

        const tenantId = profile.tenant_id;

        // 2) Get tenant plan via join
        const { data: tenant } = await supabase
          .from("tenants")
          .select("subscription_plan_id, subscription_plans(*)")
          .eq("id", tenantId)
          .single();

        const rawPlan = tenant?.subscription_plans as PlanInfo | PlanInfo[] | null | undefined;
        const planData = Array.isArray(rawPlan) ? rawPlan[0] || null : rawPlan || null;

        // 3) Get active addon slugs
        const { data: addonsData } = await supabase
          .from("tenant_addons")
          .select("addon_id, addons(slug)")
          .eq("tenant_id", tenantId);

        const slugs = (addonsData || [])
          .flatMap((ta) => {
            const addonsValue = (ta as AddonJoinRow).addons;
            if (!addonsValue) return [];
            if (Array.isArray(addonsValue)) {
              return addonsValue.map((addon) => addon?.slug).filter(Boolean) as string[];
            }
            return addonsValue.slug ? [addonsValue.slug] : [];
          })
          .filter(Boolean) as string[];

        // 4) Live counts
        const [playersRes, tournamentsRes] = await Promise.all([
          supabase
            .from("players")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId),
          supabase
            .from("tournaments")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("status", ["open", "ongoing"]),
        ]);

        if (active) {
          setPlan(planData || null);
          setAddonSlugs(slugs);
          const nextUsage = {
            playerCount: playersRes.count || 0,
            activeTournamentCount: tournamentsRes.count || 0,
          };
          setUsage(nextUsage);
          setClientCache<TenantPlanCachePayload>(cacheKey, {
            plan: planData || null,
            addonSlugs: slugs,
            usage: nextUsage,
          });
          setLoading(false);
        }
      } catch (err) {
        console.error("[useTenantPlan] error:", err);
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  const canCreatePlayer = !plan || usage.playerCount < plan.max_players;
  const canCreateTournament = !plan || usage.activeTournamentCount < plan.max_concurrent_tournaments;

  const hasFeature = (key: string): boolean => {
    // If no plan, allow everything (trial/no restrictions)
    if (!plan) return true;
    // Check plan boolean flags
    if ((PLAN_BOOLEAN_KEYS as readonly string[]).includes(key)) {
      const planKey = key as (typeof PLAN_BOOLEAN_KEYS)[number];
      return !!plan[planKey];
    }
    // Check addon slugs
    return addonSlugs.includes(key);
  };

  return {
    loading,
    plan,
    addonSlugs,
    usage,
    canCreatePlayer,
    canCreateTournament,
    hasFeature,
  };
}
