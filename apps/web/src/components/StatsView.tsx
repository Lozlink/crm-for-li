'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCRMStore, useStreetStats } from '@realestate-crm/hooks';

type SortField = 'score' | 'contactCount' | 'daysSinceLastContact' | 'streetName';
type SortDir = 'asc' | 'desc';

export default function StatsView() {
  const fetchRecentActivities = useCRMStore((s) => s.fetchRecentActivities);
  const streetStats = useStreetStats();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    fetchRecentActivities(500);
  }, [fetchRecentActivities]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'streetName' ? 'asc' : 'desc');
    }
  };

  const filtered = useMemo(() => {
    let result = [...streetStats];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) => s.streetName.toLowerCase().includes(q) || s.suburb.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      switch (sortField) {
        case 'streetName': aVal = a.streetName.toLowerCase(); bVal = b.streetName.toLowerCase(); break;
        case 'contactCount': aVal = a.contactCount; bVal = b.contactCount; break;
        case 'daysSinceLastContact': aVal = a.daysSinceLastContact ?? 9999; bVal = b.daysSinceLastContact ?? 9999; break;
        default: aVal = a.score; bVal = b.score; break;
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [streetStats, search, sortField, sortDir]);

  const handleRowClick = (lat: number, lng: number) => {
    router.push(`/map?lat=${lat}&lng=${lng}&zoom=17`);
  };

  const sortArrow = (field: SortField) => sortField === field ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : '';

  function freshnessColor(days: number | null): string {
    if (days === null) return 'bg-gray-300';
    if (days <= 7) return 'bg-green-500';
    if (days <= 30) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Street Statistics</h1>
          <p className="text-sm text-gray-500">{streetStats.length} streets tracked</p>
        </div>
      </div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search streets or suburbs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  <button onClick={() => handleSort('streetName')} className="hover:text-gray-700">Street{sortArrow('streetName')}</button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Suburb</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">
                  <button onClick={() => handleSort('contactCount')} className="hover:text-gray-700">Contacts{sortArrow('contactCount')}</button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Last Contacted</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">
                  <button onClick={() => handleSort('daysSinceLastContact')} className="hover:text-gray-700">Days Since{sortArrow('daysSinceLastContact')}</button>
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">
                  <button onClick={() => handleSort('score')} className="hover:text-gray-700">Score{sortArrow('score')}</button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  {search ? 'No streets match your search.' : 'No street data yet. Add contacts with addresses to see stats.'}
                </td></tr>
              ) : filtered.map((stat) => (
                <tr key={`${stat.streetName}|${stat.suburb}`} onClick={() => handleRowClick(stat.averageLatitude, stat.averageLongitude)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{stat.streetName}</td>
                  <td className="px-4 py-3 text-gray-600">{stat.suburb}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary-50 px-2 text-xs font-medium text-primary-700">{stat.contactCount}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {stat.lastContactedAt ? new Date(stat.lastContactedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '\u2014'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${freshnessColor(stat.daysSinceLastContact)}`} />
                      <span className="text-gray-600">{stat.daysSinceLastContact !== null ? `${stat.daysSinceLastContact}d` : '\u2014'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-gray-700">{stat.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
