'use client';

import { useTranslation } from '../../../i18n';

export default function LogsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">📝 {t('superAdmin.logs.title')}</h1>
        <p className="text-gray-600 mt-2">{t('superAdmin.logs.subtitle')}</p>
      </div>

      <div className="bg-white rounded-lg shadow p-8">
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg">🔨 {t('superAdmin.logs.inDevelopment')}</p>
          <p className="text-gray-500 text-sm mt-2">
            {t('superAdmin.logs.inDevelopmentDesc')}
          </p>
        </div>
      </div>

      <div className="bg-yellow-50 border-l-4 border-yellow-600 rounded-lg p-6">
        <p className="text-yellow-900">
          📌 {t('superAdmin.logs.logsNote')}
        </p>
      </div>
    </div>
  );
}
