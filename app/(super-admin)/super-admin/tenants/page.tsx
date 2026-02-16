'use client';

import { useEffect, useState } from 'react';
import { Tenant, PaginatedResponse } from '@/lib/types/saas';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useTranslation } from '../../../i18n';

export default function TenantsPage() {
  const { t } = useTranslation();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    fetchTenants();
  }, [page, search, status]);

  const fetchTenants = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { search }),
        ...(status && { status }),
      });

      const response = await fetch(`/api/super-admin/tenants?${params}`);
      const json: PaginatedResponse<Tenant> = await response.json();

      setTenants(json.data);
      setTotalPages(json.pagination.totalPages);
    } catch (error) {
      toast.error(t('superAdmin.tenants.errorLoading'));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">👥 {t('superAdmin.tenants.listTitle')}</h1>
          <p className="text-gray-600 mt-1">{t('superAdmin.tenants.listSubtitle')}</p>
        </div>
        <Link
          href="/super-admin/tenants/create"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          ➕ {t('superAdmin.tenants.newClient')}
        </Link>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder={t('superAdmin.tenants.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t('superAdmin.tenants.filterAll')}</option>
            <option value="trial">{t('superAdmin.tenants.filterTrial')}</option>
            <option value="active">{t('superAdmin.tenants.filterActive')}</option>
            <option value="suspended">{t('superAdmin.tenants.filterSuspended')}</option>
            <option value="cancelled">{t('superAdmin.tenants.filterCancelled')}</option>
          </select>

          <button
            onClick={() => {
              setSearch('');
              setStatus('');
              setPage(1);
            }}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            {t('common.search')}
          </button>
        </div>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="text-center py-12">{t('superAdmin.tenants.loading')}</div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          {t('superAdmin.tenants.empty')}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  {t('superAdmin.tenants.colName')}
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  {t('superAdmin.tenants.colEmail')}
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  {t('superAdmin.tenants.colPlan')}
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  {t('superAdmin.tenants.colStatus')}
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  {t('superAdmin.tenants.colFrom')}
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  {t('superAdmin.tenants.colActions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {tenant.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {tenant.admin_email}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                      Plan aquí
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <StatusBadge status={tenant.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(tenant.created_at).toLocaleDateString('es-ES')}
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    <Link
                      href={`/super-admin/tenants/${tenant.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {t('superAdmin.tenants.viewLink')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            {t('common.previous')}
          </button>
          <span className="px-4 py-2">
            {t('common.page', { page, total: totalPages })}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    trial: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };

  const labelKeys: Record<string, string> = {
    trial: 'superAdmin.tenants.statusTrial',
    active: 'superAdmin.tenants.statusActive',
    suspended: 'superAdmin.tenants.statusSuspended',
    cancelled: 'superAdmin.tenants.statusCancelled',
  };

  const { t } = useTranslation();

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${colors[status] || colors.active}`}>
      {labelKeys[status] ? t(labelKeys[status] as any) : status}
    </span>
  );
}
