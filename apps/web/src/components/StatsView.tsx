'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  usePropertyStore,
  useInspectionStore,
  useTaskStore,
  useCRMStore,
  useAuthStore,
} from '@realestate-crm/hooks';
import type { PropertyStatus } from '@realestate-crm/types';

type DateRange = 'week' | 'month' | 'quarter' | 'fy';

const STATUS_COLORS: Record<PropertyStatus, string> = {
  appraisal: '#6366f1',
  available: '#16a34a',
  under_offer: '#f59e0b',
  exchanged: '#2563eb',
  settled: '#059669',
  leased: '#0d9488',
  withdrawn: '#9ca3af',
};

const STATUS_LABELS: Record<PropertyStatus, string> = {
  appraisal: 'Appraisal',
  available: 'Listed',
  under_offer: 'Under Offer',
  exchanged: 'Exchanged',
  settled: 'Settled',
  leased: 'Leased',
  withdrawn: 'Withdrawn',
};

const ALL_STATUSES: PropertyStatus[] = [
  'appraisal',
  'available',
  'under_offer',
  'exchanged',
  'settled',
  'leased',
  'withdrawn',
];

function getDateRangeBounds(range: DateRange): { start: Date; end: Date } {
  const now = new Date();
  const end = now;
  let start: Date;

  switch (range) {
    case 'week': {
      start = new Date(now);
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    }
    case 'quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qMonth, 1);
      break;
    }
    case 'fy': {
      const fyYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
      start = new Date(fyYear, 6, 1);
      break;
    }
  }

  return { start, end };
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${Math.round(value)}`;
}

export default function StatsView() {
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [agentFilter, setAgentFilter] = useState<string>('all');

  const properties = usePropertyStore(state => state.properties);
  const fetchProperties = usePropertyStore(state => state.fetchProperties);
  const inspections = useInspectionStore(state => state.inspections);
  const fetchInspections = useInspectionStore(state => state.fetchInspections);
  const tasks = useTaskStore(state => state.tasks);
  const fetchTasks = useTaskStore(state => state.fetchTasks);
  const contacts = useCRMStore(state => state.contacts);
  const recentActivities = useCRMStore(state => state.activities);
  const fetchContacts = useCRMStore(state => state.fetchContacts);
  const fetchRecentActivities = useCRMStore(state => state.fetchActivities);
  const teamMembers = useAuthStore(state => state.teamMembers);
  const activeTeam = useAuthStore(state => state.activeTeam);
  const fetchTeamMembers = useAuthStore(state => state.fetchTeamMembers);

  useEffect(() => {
    fetchProperties();
    fetchInspections();
    fetchTasks();
    fetchContacts();
    fetchRecentActivities(500);
    if (activeTeam?.id) {
      fetchTeamMembers(activeTeam.id);
    }
  }, [fetchProperties, fetchInspections, fetchTasks, fetchContacts, fetchRecentActivities, activeTeam?.id, fetchTeamMembers]);

  // 1. Active Listings
  const activeListings = useMemo(() => {
    return properties.filter(p =>
      ['available', 'under_offer'].includes(p.status)
    );
  }, [properties]);

  const activeListingsCount = activeListings.length;
  const activeListingsValue = useMemo(() => {
    return activeListings.reduce((sum, p) => sum + (p.advertised_price || 0), 0);
  }, [activeListings]);

  // 2. Conversion Rate
  const conversionRate = useMemo(() => {
    if (properties.length === 0) return 0;
    const converted = properties.filter(p =>
      ['exchanged', 'settled', 'leased'].includes(p.status)
    ).length;
    return (converted / properties.length) * 100;
  }, [properties]);

  const convertedCount = useMemo(() => {
    return properties.filter(p =>
      ['exchanged', 'settled', 'leased'].includes(p.status)
    ).length;
  }, [properties]);

  // 3. Avg Days on Market
  const avgDaysOnMarket = useMemo(() => {
    const relevant = properties.filter(
      p => ['settled', 'leased'].includes(p.status) && p.listed_at && p.settled_at
    );
    if (relevant.length === 0) return null;
    const totalDays = relevant.reduce((sum, p) => {
      const listed = new Date(p.listed_at!).getTime();
      const settled = new Date(p.settled_at!).getTime();
      return sum + (settled - listed) / (1000 * 60 * 60 * 24);
    }, 0);
    return Math.round(totalDays / relevant.length);
  }, [properties]);

  // 4. Commission Forecast
  const commissionForecast = useMemo(() => {
    return activeListings.reduce((sum, p) => {
      const price = p.advertised_price || 0;
      const rate = p.commission_percent || 2;
      return sum + (price * rate) / 100;
    }, 0);
  }, [activeListings]);

  // 5. Inspections Held
  const completedInspections = useMemo(() => {
    return inspections.filter(i => i.status === 'completed');
  }, [inspections]);

  const avgAttendees = useMemo(() => {
    if (completedInspections.length === 0) return 0;
    const total = completedInspections.reduce((sum, i) => {
      const count = Array.isArray(i.attendees)
        ? i.attendees.length
        : (typeof i.attendees === 'object' && i.attendees !== null && 'count' in (i.attendees as Record<string, unknown>))
          ? ((i.attendees as unknown as { count: number }).count || 0)
          : 0;
      return sum + count;
    }, 0);
    return Math.round((total / completedInspections.length) * 10) / 10;
  }, [completedInspections]);

  // 6. Tasks Overdue
  const overdueTasks = useMemo(() => {
    const now = new Date();
    return tasks.filter(
      t => t.status === 'pending' && t.due_at && new Date(t.due_at) < now
    );
  }, [tasks]);

  // 7. Pipeline by Stage
  const pipelineByStage = useMemo(() => {
    const counts: Record<PropertyStatus, number> = {
      appraisal: 0,
      available: 0,
      under_offer: 0,
      exchanged: 0,
      settled: 0,
      leased: 0,
      withdrawn: 0,
    };
    for (const p of properties) {
      counts[p.status] = (counts[p.status] || 0) + 1;
    }
    return counts;
  }, [properties]);

  const pipelineTotal = useMemo(() => {
    return Object.values(pipelineByStage).reduce((a, b) => a + b, 0);
  }, [pipelineByStage]);

  // 8. Contact Activity
  const contactActivity = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisMonth = contacts.filter(
      c => c.created_at && new Date(c.created_at) >= thisMonthStart
    ).length;
    const lastMonth = contacts.filter(
      c =>
        c.created_at &&
        new Date(c.created_at) >= lastMonthStart &&
        new Date(c.created_at) < thisMonthStart
    ).length;

    return { thisMonth, lastMonth };
  }, [contacts]);

  // Activity trend for last 8 weeks
  const activityTrend = useMemo(() => {
    const weeks: number[] = [];
    const now = new Date();

    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i * 7 + weekStart.getDay()));
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const count = recentActivities.filter(a => {
        if (!a.created_at) return false;
        const date = new Date(a.created_at);
        return date >= weekStart && date < weekEnd;
      }).length;

      weeks.push(count);
    }

    return weeks;
  }, [recentActivities]);

  const maxActivity = useMemo(() => Math.max(...activityTrend, 1), [activityTrend]);

  const dateRangeButtons: { label: string; value: DateRange }[] = [
    { label: 'Week', value: 'week' },
    { label: 'Month', value: 'month' },
    { label: 'Quarter', value: 'quarter' },
    { label: 'FY', value: 'fy' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">
            {properties.length} properties, {contacts.length} contacts tracked
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Agent filter */}
          {teamMembers.length > 0 && (
            <select
              value={agentFilter}
              onChange={e => setAgentFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="all">All Agents</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.profile?.display_name || m.user_id}
                </option>
              ))}
            </select>
          )}

          {/* Date range filter */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {dateRangeButtons.map(btn => (
              <button
                key={btn.value}
                onClick={() => setDateRange(btn.value)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  dateRange === btn.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Active Listings */}
        <MetricCard
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
              <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
              </svg>
            </div>
          }
          title="Active Listings"
          value={String(activeListingsCount)}
          subtitle={activeListingsValue > 0 ? `${formatCurrency(activeListingsValue)} total value` : 'No listed value'}
        />

        {/* Conversion Rate */}
        <MetricCard
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
              <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </div>
          }
          title="Conversion Rate"
          value={`${conversionRate.toFixed(1)}%`}
          subtitle={`${convertedCount} of ${properties.length} properties`}
        />

        {/* Avg Days on Market */}
        <MetricCard
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
              <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          }
          title="Avg Days on Market"
          value={avgDaysOnMarket !== null ? `${avgDaysOnMarket}` : '\u2014'}
          subtitle={avgDaysOnMarket !== null ? 'days (settled/leased)' : 'No settled properties yet'}
        />

        {/* Commission Forecast */}
        <MetricCard
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
              <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          }
          title="Commission Forecast"
          value={formatCurrency(commissionForecast)}
          subtitle={`From ${activeListingsCount} active listing${activeListingsCount !== 1 ? 's' : ''}`}
        />

        {/* Inspections Held */}
        <MetricCard
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50">
              <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
          }
          title="Inspections Held"
          value={String(completedInspections.length)}
          subtitle={completedInspections.length > 0 ? `Avg ${avgAttendees} attendees` : 'No completed inspections'}
        />

        {/* Tasks Overdue */}
        <MetricCard
          icon={
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${overdueTasks.length > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <svg className={`h-5 w-5 ${overdueTasks.length > 0 ? 'text-red-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          }
          title="Tasks Overdue"
          value={String(overdueTasks.length)}
          subtitle={overdueTasks.length > 0 ? 'Require attention' : 'All tasks on track'}
          highlight={overdueTasks.length > 0}
        />

        {/* Contact Activity */}
        <MetricCard
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50">
              <svg className="h-5 w-5 text-teal-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
              </svg>
            </div>
          }
          title="Contact Activity"
          value={String(contactActivity.thisMonth)}
          subtitle={contactActivity.lastMonth > 0 ? `vs ${contactActivity.lastMonth} last month` : 'Contacts added this month'}
        />

        {/* Total Properties */}
        <MetricCard
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50">
              <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
          }
          title="Total Properties"
          value={String(properties.length)}
          subtitle={`${contacts.length} contacts in CRM`}
        />
      </div>

      {/* Pipeline by Stage - Full Width */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pipeline by Stage</h2>
        {pipelineTotal > 0 ? (
          <div className="space-y-3">
            {ALL_STATUSES.map(status => {
              const count = pipelineByStage[status];
              if (count === 0) return null;
              const pct = (count / pipelineTotal) * 100;
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-gray-600 shrink-0">{STATUS_LABELS[status]}</span>
                  <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg flex items-center px-2 transition-all duration-500"
                      style={{
                        width: `${Math.max(pct, 5)}%`,
                        backgroundColor: STATUS_COLORS[status],
                      }}
                    >
                      <span className="text-xs font-medium text-white">{count}</span>
                    </div>
                  </div>
                  <span className="text-sm text-gray-400 w-10 text-right">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No properties in pipeline yet.</p>
        )}
      </div>

      {/* Activity Trend - Full Width */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity Trend (Last 8 Weeks)</h2>
        {recentActivities.length > 0 ? (
          <div className="flex items-end gap-2 h-32">
            {activityTrend.map((count, idx) => {
              const height = maxActivity > 0 ? (count / maxActivity) * 100 : 0;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-500">{count}</span>
                  <div className="w-full relative" style={{ height: '100px' }}>
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-500"
                      style={{
                        height: `${Math.max(height, 2)}%`,
                        backgroundColor: idx === activityTrend.length - 1 ? '#6366f1' : '#c7d2fe',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">W{idx + 1}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No activity data available.</p>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
  subtitle,
  highlight = false,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-500">{title}</p>
          <p className={`text-3xl font-bold mt-1 ${highlight ? 'text-red-600' : 'text-gray-900'}`}>
            {value}
          </p>
          <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
