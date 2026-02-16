'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import { useTranslation } from '../i18n';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    verifySuperAdmin();
  }, []);

  const verifySuperAdmin = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
        router.push('/');
        return;
      }

      setIsLoading(false);
    } catch (error) {
      router.push('/login');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <p className="text-gray-600">{t('superAdmin.layout.verifying')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-gray-900 text-white transition-all duration-300 flex flex-col`}>
        {/* Logo */}
        <div className="p-6 border-b border-gray-800">
          <Link href="/super-admin" className="text-2xl font-bold flex items-center gap-2">
            {isSidebarOpen ? (
              <>
                <span>🚀</span>
                <span>PadelX QA SA</span>
              </>
            ) : (
              <span>🚀</span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavLink
            href="/super-admin"
            icon="📊"
            label={t('superAdmin.layout.dashboardLabel')}
            isOpen={isSidebarOpen}
          />
          <NavLink
            href="/super-admin/tenants"
            icon="👥"
            label={t('superAdmin.layout.clientsLabel')}
            isOpen={isSidebarOpen}
          />
          <NavLink
            href="/super-admin/analytics"
            icon="📈"
            label={t('superAdmin.layout.analyticsLabel')}
            isOpen={isSidebarOpen}
          />
          <NavLink
            href="/super-admin/plans"
            icon="📋"
            label={t('superAdmin.layout.plansLabel')}
            isOpen={isSidebarOpen}
          />
          <NavLink
            href="/super-admin/addons"
            icon="➕"
            label={t('superAdmin.layout.addonsLabel')}
            isOpen={isSidebarOpen}
          />
          <NavLink
            href="/super-admin/logs"
            icon="📝"
            label={t('superAdmin.layout.auditLabel')}
            isOpen={isSidebarOpen}
          />
          <NavLink
            href="/super-admin/settings"
            icon="⚙️"
            label={t('superAdmin.layout.configLabel')}
            isOpen={isSidebarOpen}
          />
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 space-y-2">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full p-2 hover:bg-gray-800 rounded-lg text-left text-sm"
          >
            {isSidebarOpen ? '◀️' : '▶️'}
          </button>
          <button
            onClick={handleLogout}
            className="w-full p-2 bg-red-600 hover:bg-red-700 rounded-lg text-left text-sm"
          >
            {isSidebarOpen ? `🚪 ${t('superAdmin.layout.logout')}` : '🚪'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="px-8 py-6">
            <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.layout.headerTitle')}</h1>
            <p className="text-sm text-gray-600">{t('superAdmin.layout.headerSubtitle')}</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-8 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

function NavLink({
  href,
  icon,
  label,
  isOpen,
}: {
  href: string;
  icon: string;
  label: string;
  isOpen: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition text-gray-300 hover:text-white"
    >
      <span className="text-lg">{icon}</span>
      {isOpen && <span className="text-sm">{label}</span>}
    </Link>
  );
}
