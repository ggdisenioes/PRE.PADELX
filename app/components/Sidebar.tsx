// ./app/components/Sidebar.tsx

"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRole } from "../hooks/useRole";
import { useTenantPlan } from "../hooks/useTenantPlan";
import { useTranslation } from "../i18n";
import LanguageSelector from "./LanguageSelector";
import toast from "react-hot-toast";

type SidebarProps = {
  onLinkClick?: () => void;
};

type UserInfo = {
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export default function Sidebar({ onLinkClick }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { role, isAdmin, isManager } = useRole();
  const { hasFeature, loading: planLoading } = useTenantPlan();
  const { t } = useTranslation();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", session.user.id)
          .single();

        setUser({
          email: session.user.email ?? null,
          first_name: profile?.first_name ?? null,
          last_name: profile?.last_name ?? null,
        });
      } else {
        setUser(null);
      }
    };

    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name,last_name")
            .eq("id", session.user.id)
            .single();

          setUser({
            email: session.user.email ?? null,
            first_name: profile?.first_name ?? null,
            last_name: profile?.last_name ?? null,
          });
        } else {
          setUser(null);
        }
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error cerrando sesión:", error);
    } finally {
      setUser(null);
      router.push("/login");
    }
  };

  const handleProtectedNavigation = (
    e: React.MouseEvent,
    href: string
  ) => {
    if (!user) {
      e.preventDefault();
      toast.error(t("auth.loginRequired"));
      router.push("/login");
    } else {
      router.push(href);
    }
  };

  // MENÚ GENERAL (visible para todos, algunos gated por plan)
  const generalMenuItems = [
    { id: "dashboard", label: t("nav.dashboard"), href: "/", emoji: "📊" },
    { id: "tournaments", label: t("nav.tournaments"), href: "/tournaments", emoji: "🏆" },
    { id: "players", label: t("nav.players"), href: "/players", emoji: "👥" },
    { id: "matches", label: t("nav.matches"), href: "/matches", emoji: "🎾" },
    { id: "ranking", label: t("nav.ranking"), href: "/ranking", emoji: "⭐", requiredFeature: "has_advanced_rankings" },
    { id: "news", label: t("nav.news"), href: "/news", emoji: "📰" },
    { id: "challenges", label: t("nav.challenges"), href: "/challenges", emoji: "⚔️" },
    { id: "bookings", label: t("nav.bookings"), href: "/bookings", emoji: "📅" },
    { id: "mi-cuenta", label: t("nav.myAccount"), href: "/mi-cuenta", emoji: "👤" },
  ];

  // MENÚ ADMINISTRACIÓN (solo Admin/Manager)
  const adminMenuItems = [
    { id: "management", label: t("nav.userManagement"), href: "/admin/management", emoji: "⚙️" },
    { id: "courts", label: t("nav.courtAdmin"), href: "/courts", emoji: "🏟️" },
    { id: "news-admin", label: t("nav.newsAdmin"), href: "/admin/news", emoji: "📝" },
    { id: "analytics", label: t("nav.analytics"), href: "/admin/analytics", emoji: "📈", requiredFeature: "has_player_stats" },
  ];

  const getInitials = (u: UserInfo | null): string => {
    if (!u) return "US";
    const full = [u.first_name, u.last_name].filter(Boolean).join(" ");
    if (full) {
      const parts = full.split(" ");
      const first = parts[0]?.[0] ?? "";
      const last = parts[1]?.[0] ?? "";
      return (first + last).toUpperCase() || "US";
    }
    if (u.email) {
      const namePart = u.email.split("@")[0];
      return namePart.slice(0, 2).toUpperCase();
    }
    return "US";
  };

  const getDisplayName = (u: UserInfo | null) => {
    if (!u) return "";
    const full = [u.first_name, u.last_name].filter(Boolean).join(" ");
    return full || u.email || "";
  };

  const getRoleBadge = () => {
    if (isAdmin) return { text: "ADMIN", color: "bg-red-600" };
    if (isManager) return { text: "MANAGER", color: "bg-blue-600" };
    return null;
  };

  const renderMenuItem = (item: { id: string; label: string; href: string; emoji: string; requiredFeature?: string }) => {
    const active =
      (item.href === "/" && pathname === "/") ||
      (item.href !== "/" && pathname.startsWith(item.href));

    return (
      <div key={item.id} className="relative">
        {active && (
          <div className="absolute left-0 top-0 h-full w-1 bg-[#00b4ff]" />
        )}

        <Link
          href={item.href}
          onClick={(e) => handleProtectedNavigation(e, item.href)}
          className={`relative flex items-center gap-3 px-6 py-3 text-[15px] font-medium transition
            ${active ? "bg-white/10" : "hover:bg-white/5"}
          `}
        >
          <span className="text-lg">{item.emoji}</span>
          <span className="text-[17px] text-white">{item.label}</span>
        </Link>
      </div>
    );
  };

  return (
    <aside className="w-56 h-screen flex flex-col text-white bg-gradient-to-b from-[#0b1220] via-[#0e1626] to-[#0a1020] border-r border-white/5 overflow-hidden">
      {/* HEADER / LOGO */}
      <div className="px-5 py-6 border-b border-white/10 text-center">
        <h1 className="text-[26px] font-extrabold italic tracking-tight">
          PadelX QA
        </h1>
        <p className="mt-1 text-[10px] font-bold tracking-[0.3em] text-[#00b4ff] uppercase">
          Pádel Manager
        </p>
      </div>

      {/* MENÚ */}
      <nav className="flex-1 overflow-y-auto overscroll-contain px-0 py-3">
        {/* SECCIÓN GENERAL */}
        <div>
          <p className="px-6 py-2 text-xs font-semibold text-gray-400 uppercase tracking-widest">General</p>
          {generalMenuItems
            .filter(item => !item.requiredFeature || hasFeature(item.requiredFeature))
            .map(renderMenuItem)}
        </div>

        {/* SECCIÓN ADMINISTRACIÓN (solo Admin/Manager con usuario logueado) */}
        {user && (isAdmin || isManager) && (
          <div className="mt-6 border-t border-white/10 pt-3">
            <button
              onClick={() => setAdminMenuOpen(!adminMenuOpen)}
              className="w-full flex items-center justify-between px-6 py-3 text-[15px] font-medium hover:bg-white/5 transition"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">🔐</span>
                <span className="text-white">{t("nav.administration")}</span>
              </div>
              <span className={`text-lg transition ${adminMenuOpen ? "rotate-180" : ""}`}>
                ▼
              </span>
            </button>

            {/* Items del menú admin colapsable */}
            {adminMenuOpen && (
              <div className="bg-white/5">
                {adminMenuItems
                  .filter(item => !item.requiredFeature || hasFeature(item.requiredFeature))
                  .map(renderMenuItem)}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* FOOTER USUARIO */}
      <div className="border-t border-white/10 p-4 shrink-0">
        {user ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-sm">
                {getInitials(user)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 gap-1">
                  <p className="text-sm font-semibold truncate">
                    {user?.first_name || user?.email}
                  </p>
                  {/* BADGE DEL ROL */}
                  {getRoleBadge() && (
                    <span className={`${getRoleBadge()?.color} text-white text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap`}>
                      {getRoleBadge()?.text}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate">
                  {user?.email}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full rounded-md bg-red-600/30 text-red-300 py-[7px] text-[13px] font-semibold hover:bg-red-600/50 transition"
            >
              {t("auth.logout")}
            </button>
          </>
        ) : (
          <div className="text-center">
            <Link
              href="/login"
              onClick={onLinkClick}
              className="text-sm text-[#00b4ff] hover:underline"
            >
              {t("auth.login")} &rarr;
            </Link>
          </div>
        )}

        <div className="mt-3 flex items-center justify-center gap-2">
          <LanguageSelector />
        </div>

        <p className="mt-2 text-center text-[9px] text-gray-500">
          {t("common.developedBy")}{" "}
          <a
            href="https://ggdisenio.es"
            target="_blank"
            rel="noreferrer"
            className="font-bold hover:text-[#00b4ff]"
          >
            GGDisenio.es
          </a>
        </p>
      </div>
    </aside>
  );
}
