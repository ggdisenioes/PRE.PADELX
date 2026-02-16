'use client';

import { useEffect, useState } from 'react';
import { SaaSMetrics } from '@/lib/types/saas';
import { useTranslation } from '../../i18n';

export default function SuperAdminDashboard() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<SaaSMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/super-admin/analytics/metrics');
      const json = await response.json();
      setMetrics(json.data);
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div>{t('superAdmin.dashboard.loading')}</div>;
  }

  if (!metrics) {
    return <div>{t('superAdmin.dashboard.errorLoading')}</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-gray-900">{t('superAdmin.dashboard.title')}</h1>
        <p className="text-gray-600 mt-2">{t('superAdmin.dashboard.subtitle')}</p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MetricCard
          title="MRR"
          value={`€${metrics.mrr.toLocaleString('es-ES', {
            minimumFractionDigits: 2,
          })}`}
          subtitle={t('superAdmin.dashboard.mrrSubtitle')}
          color="bg-blue-50"
          icon="💶"
        />
        <MetricCard
          title="ARR"
          value={`€${metrics.arr.toLocaleString('es-ES', {
            minimumFractionDigits: 2,
          })}`}
          subtitle={t('superAdmin.dashboard.arrSubtitle')}
          color="bg-green-50"
          icon="📈"
        />
        <MetricCard
          title={t('superAdmin.dashboard.activeClientsTitle')}
          value={metrics.activeTenants.toString()}
          subtitle={t('superAdmin.dashboard.activeClientsSubtitle')}
          color="bg-purple-50"
          icon="👥"
        />
        <MetricCard
          title={t('superAdmin.dashboard.trialTitle')}
          value={metrics.trialTenants.toString()}
          subtitle={t('superAdmin.dashboard.trialSubtitle')}
          color="bg-orange-50"
          icon="⏰"
        />
      </div>

      {/* Health metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-4">{t('superAdmin.dashboard.churnTitle')}</h3>
          <div className="text-5xl font-bold text-red-600">
            {metrics.churnRate.toFixed(2)}%
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {metrics.churnRate < 5
              ? `✅ ${t('superAdmin.dashboard.churnHealthy')}`
              : metrics.churnRate < 10
              ? `⚠️ ${t('superAdmin.dashboard.churnNormal')}`
              : `🔴 ${t('superAdmin.dashboard.churnHigh')}`}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-4">{t('superAdmin.dashboard.planDistribution')}</h3>
          <div className="space-y-2">
            {Object.entries(metrics.planDistribution).map(([plan, count]) => (
              <div key={plan} className="flex justify-between items-center">
                <span className="text-gray-700">{plan}</span>
                <span className="font-bold text-blue-600">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold mb-4">{t('superAdmin.dashboard.quickActions')}</h3>
        <div className="flex gap-3">
          <a
            href="/super-admin/tenants/create"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            ➕ {t('superAdmin.dashboard.createNewClient')}
          </a>
          <a
            href="/super-admin/tenants"
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            👥 {t('superAdmin.dashboard.viewClients')}
          </a>
          <a
            href="/super-admin/analytics"
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            📊 {t('superAdmin.dashboard.viewAnalytics')}
          </a>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  color,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: string;
  icon: string;
}) {
  return (
    <div className={`${color} rounded-lg shadow p-6`}>
      <p className="text-gray-600 text-sm">{title}</p>
      <p className="text-3xl font-bold text-gray-900 mt-2">{icon} {value}</p>
      <p className="text-xs text-gray-600 mt-2">{subtitle}</p>
    </div>
  );
}
