'use client';

import { useEffect, useState } from 'react';
import { Addon } from '@/lib/types/saas';
import toast from 'react-hot-toast';
import { useTranslation } from '../../../i18n';

export default function AddonsPage() {
  const { t } = useTranslation();
  const [addons, setAddons] = useState<Addon[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAddons();
  }, []);

  const fetchAddons = async () => {
    try {
      const response = await fetch('/api/super-admin/addons');
      const json = await response.json();
      setAddons(json.data);
    } catch (error) {
      toast.error(t('superAdmin.addons.errorLoading'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div>{t('superAdmin.addons.loading')}</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">➕ {t('superAdmin.addons.title')}</h1>
        <p className="text-gray-600 mt-2">{t('superAdmin.addons.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {addons.map((addon) => (
          <div key={addon.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold">{addon.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{addon.description}</p>
              </div>
              {addon.icon && <span className="text-2xl">{addon.icon}</span>}
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded">
              <p className="font-bold text-blue-600">
                €{addon.price_eur}
                <span className="text-sm">
                  /{addon.billing_type === 'monthly' ? t('superAdmin.addons.perMonth') : t('superAdmin.addons.oneTime')}
                </span>
              </p>
            </div>

            <div className="mt-4 text-sm">
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  addon.is_active
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {addon.is_active ? `✅ ${t('superAdmin.addons.active')}` : `❌ ${t('superAdmin.addons.inactive')}`}
              </span>
            </div>

            <button
              className="mt-4 w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition disabled:opacity-50"
              disabled
            >
              ⚙️ {t('superAdmin.addons.comingSoon')}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-green-50 border-l-4 border-green-600 rounded-lg p-6">
        <p className="text-green-900">
          ✅ {t('superAdmin.addons.totalAddons', { count: addons.length })}
        </p>
      </div>
    </div>
  );
}
