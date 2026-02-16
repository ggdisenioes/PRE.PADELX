'use client';

import { useEffect, useState } from 'react';
import { SaaSMetrics } from '@/lib/types/saas';
import toast from 'react-hot-toast';
import { useTranslation } from '../../../i18n';

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<SaaSMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000); // Refrescar cada minuto
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/super-admin/analytics/metrics');
      const json = await response.json();
      setMetrics(json.data);
    } catch (error) {
      toast.error(t('superAdmin.analytics.errorLoading'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div>{t('superAdmin.analytics.loading')}</div>;
  if (!metrics) return <div>{t('superAdmin.analytics.errorLoading')}</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold">📊 {t('superAdmin.analytics.title')}</h1>
        <p className="text-gray-600 mt-2">{t('superAdmin.analytics.subtitle')}</p>
      </div>

      {/* Revenue Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow p-8">
          <p className="text-gray-700 text-sm font-semibold uppercase tracking-wide">
            {t('superAdmin.analytics.mrrLabel')}
          </p>
          <p className="text-5xl font-bold text-blue-600 mt-3">
            €{metrics.mrr.toLocaleString('es-ES', {
              minimumFractionDigits: 2,
            })}
          </p>
          <p className="text-sm text-gray-600 mt-3">
            💶 {t('superAdmin.analytics.mrrSubtitle')}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {t('superAdmin.analytics.mrrDesc')}
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow p-8">
          <p className="text-gray-700 text-sm font-semibold uppercase tracking-wide">
            {t('superAdmin.analytics.arrLabel')}
          </p>
          <p className="text-5xl font-bold text-green-600 mt-3">
            €{metrics.arr.toLocaleString('es-ES', {
              minimumFractionDigits: 2,
            })}
          </p>
          <p className="text-sm text-gray-600 mt-3">
            📈 {t('superAdmin.analytics.arrSubtitle')}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {t('superAdmin.analytics.arrDesc')}
          </p>
        </div>
      </div>

      {/* Customer Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg shadow p-8">
          <p className="text-gray-700 text-sm font-semibold uppercase tracking-wide">
            {t('superAdmin.analytics.activeClientsLabel')}
          </p>
          <p className="text-5xl font-bold text-purple-600 mt-3">
            {metrics.activeTenants}
          </p>
          <p className="text-sm text-gray-600 mt-3">
            👥 {t('superAdmin.analytics.activeClientsSubtitle')}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {t('superAdmin.analytics.activeClientsDesc')}
          </p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg shadow p-8">
          <p className="text-gray-700 text-sm font-semibold uppercase tracking-wide">
            {t('superAdmin.analytics.trialLabel')}
          </p>
          <p className="text-5xl font-bold text-orange-600 mt-3">
            {metrics.trialTenants}
          </p>
          <p className="text-sm text-gray-600 mt-3">
            ⏰ {t('superAdmin.analytics.trialSubtitle')}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {metrics.trialTenants === 0
              ? t('superAdmin.analytics.noTrialClients')
              : t('superAdmin.analytics.trialPercent', {
                  pct: Math.round(
                    (metrics.trialTenants /
                      (metrics.activeTenants + metrics.trialTenants)) *
                      100
                  ),
                })}
          </p>
        </div>
      </div>

      {/* Health Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-8">
          <h3 className="text-xl font-bold mb-6">{t('superAdmin.analytics.churnTitle')}</h3>
          <p className="text-6xl font-bold text-red-600 mb-4">
            {metrics.churnRate.toFixed(2)}%
          </p>
          <div className="space-y-2">
            {metrics.churnRate < 5 ? (
              <>
                <p className="text-green-600 font-semibold">
                  ✅ {t('superAdmin.analytics.churnHealthy')}
                </p>
                <p className="text-sm text-gray-600">
                  {t('superAdmin.analytics.churnHealthyDesc')}
                </p>
              </>
            ) : metrics.churnRate < 10 ? (
              <>
                <p className="text-orange-600 font-semibold">
                  ⚠️ {t('superAdmin.analytics.churnNormal')}
                </p>
                <p className="text-sm text-gray-600">
                  {t('superAdmin.analytics.churnNormalDesc')}
                </p>
              </>
            ) : (
              <>
                <p className="text-red-600 font-semibold">
                  🔴 {t('superAdmin.analytics.churnHigh')}
                </p>
                <p className="text-sm text-gray-600">
                  {t('superAdmin.analytics.churnHighDesc')}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-8">
          <h3 className="text-lg font-bold mb-6">{t('superAdmin.analytics.planDistribution')}</h3>
          <div className="space-y-3">
            {Object.entries(metrics.planDistribution).map(
              ([plan, count]) => {
                const total = metrics.activeTenants;
                const percentage = total ? (count / total) * 100 : 0;

                return (
                  <div key={plan}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">
                        {plan}
                      </span>
                      <span className="text-sm font-bold text-blue-600">
                        {count} ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </div>

      {/* Add-ons Popularity */}
      <div className="bg-white rounded-lg shadow p-8">
        <h3 className="text-xl font-bold mb-6">{t('superAdmin.analytics.popularAddons')}</h3>
        <div className="space-y-3">
          {Object.entries(metrics.addonsPopularity)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([addon, count]) => (
              <div key={addon} className="flex items-center justify-between">
                <span className="text-gray-700">{addon}</span>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">{count} {t('superAdmin.analytics.clients')}</span>
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{
                        width: `${
                          (count /
                            Math.max(
                              ...Object.values(
                                metrics.addonsPopularity
                              ))) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Insights */}
      <div className="bg-blue-50 border-l-4 border-blue-600 rounded-lg p-8">
        <h3 className="text-lg font-bold text-blue-900 mb-3">💡 {t('superAdmin.analytics.insightsTitle')}</h3>
        <ul className="space-y-2 text-blue-900 text-sm">
          <li>
            • {t('superAdmin.analytics.insightLtv', { value: (metrics.mrr * 12).toLocaleString('es-ES') })}
          </li>
          <li>
            • {t('superAdmin.analytics.insightCac')}
          </li>
          <li>
            • {t('superAdmin.analytics.insightPopularPlan', {
                plan: Object.entries(metrics.planDistribution).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A',
              })}
          </li>
        </ul>
      </div>

      {/* Refresh button */}
      <div className="text-center">
        <button
          onClick={fetchMetrics}
          className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
        >
          🔄 {t('superAdmin.analytics.refreshButton')}
        </button>
        <p className="text-xs text-gray-500 mt-2">
          {t('superAdmin.analytics.autoRefresh')}
        </p>
      </div>
    </div>
  );
}
