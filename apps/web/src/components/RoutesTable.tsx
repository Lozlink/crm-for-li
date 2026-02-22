'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouteStore } from '@realestate-crm/hooks';
import type { Route, RouteStatus } from '@realestate-crm/types';

const STATUS_STYLES: Record<RouteStatus, string> = {
  planned: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-yellow-50 text-yellow-700',
  completed: 'bg-green-50 text-green-700',
};

const STATUS_LABELS: Record<RouteStatus, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const FILTER_OPTIONS: { label: string; value: RouteStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Planned', value: 'planned' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
];

function getStopCount(route: Route): string {
  // route_stops is an aggregate from Supabase select('*, route_stops(count)')
  const rs = (route as unknown as Record<string, unknown>).route_stops;
  if (Array.isArray(rs) && rs.length > 0 && typeof rs[0] === 'object' && rs[0] !== null) {
    const count = (rs[0] as Record<string, unknown>).count;
    if (typeof count === 'number') return String(count);
  }
  if (route.stops?.length) return String(route.stops.length);
  return '\u2014';
}

export default function RoutesTable() {
  const routes = useRouteStore((s) => s.routes);
  const isLoading = useRouteStore((s) => s.isLoading);
  const fetchRoutes = useRouteStore((s) => s.fetchRoutes);
  const deleteRoute = useRouteStore((s) => s.deleteRoute);

  const [filter, setFilter] = useState<RouteStatus | 'all'>('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  const filtered = useMemo(() => {
    if (filter === 'all') return routes;
    return routes.filter((r) => r.status === filter);
  }, [routes, filter]);

  const handleDelete = async (route: Route) => {
    if (!confirm(`Delete route "${route.name}"? This cannot be undone.`)) return;
    setDeleting(route.id);
    try {
      await deleteRoute(route.id);
    } catch (err) {
      console.error('Failed to delete route:', err);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Routes</h1>
        <Link
          href="/routes/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Route
        </Link>
      </div>

      {/* Status filter chips */}
      <div className="mb-4 flex gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filter === opt.value
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-500">
            {routes.length === 0
              ? 'No routes yet. Create your first route to get started.'
              : 'No routes match the selected filter.'}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Stops</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((route) => (
                <tr key={route.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/routes/${route.id}`}
                      className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                    >
                      {route.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[route.status]}`}
                    >
                      {STATUS_LABELS[route.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{getStopCount(route)}</td>
                  <td className="px-4 py-3 text-sm capitalize text-gray-600">{route.mode}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {route.created_at
                      ? new Date(route.created_at).toLocaleDateString()
                      : '\u2014'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(route)}
                      disabled={deleting === route.id}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 transition-colors"
                      title="Delete route"
                    >
                      {deleting === route.id ? (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
