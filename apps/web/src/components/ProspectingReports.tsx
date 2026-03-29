'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useProspectingMetrics,
  usePropertyStore,
  useTrackingStore,
  useInspectionStore,
  useDataEnrichmentStore,
} from '@realestate-crm/hooks';
import type {
  ProspectingTrend,
  StaleStreet,
  WeeklyTrendPoint,
  ProspectingStreak,
  InspectionMetrics,
  RecommendedArea,
  MultiDwellingBuilding,
} from '@realestate-crm/hooks';
import type { SuburbStats, SoldRecord } from '@realestate-crm/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatKm(meters: number): string {
  if (meters === 0) return '0 km';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '0 min';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function formatLastVisited(days: number | null): string {
  if (days === null) return 'Never';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function staleness(days: number | null): 'never' | 'fresh' | 'amber' | 'red' {
  if (days === null) return 'never';
  if (days < 7) return 'fresh';
  if (days <= 30) return 'amber';
  return 'red';
}

const STALENESS_CHIP: Record<string, string> = {
  never: 'bg-gray-100 text-gray-500',
  fresh: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
};

const STALENESS_LABEL: Record<string, string> = {
  never: 'Never visited',
  fresh: 'Recent',
  amber: 'Stale',
  red: 'Overdue',
};

function scoreBadgeClass(score: number): string {
  if (score > 70) return 'bg-green-100 text-green-700';
  if (score >= 40) return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-500';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const now = Date.now();
  const days = Math.floor((now - d.getTime()) / (1000 * 60 * 60 * 24));
  return formatLastVisited(days);
}

// ---------------------------------------------------------------------------
// Trend badge
// ---------------------------------------------------------------------------

function TrendBadge({ trend }: { trend: ProspectingTrend }) {
  const { changePercent } = trend;

  if (changePercent === null) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        New
      </span>
    );
  }

  if (changePercent === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        &mdash; 0%
      </span>
    );
  }

  const isPositive = changePercent > 0;
  const colorClass = isPositive
    ? 'bg-green-50 text-green-700'
    : 'bg-red-50 text-red-700';

  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {isPositive ? (
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
        </svg>
      ) : (
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      )}
      {Math.abs(changePercent)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  trend,
  icon,
  iconBg,
}: {
  label: string;
  value: string | number;
  trend: ProspectingTrend;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <TrendBadge trend={trend} />
      </div>
      <div className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-gray-900">{value}</p>
        <p className="mt-0.5 text-xs text-gray-400">
          vs {trend.previous} last week
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streak Banner
// ---------------------------------------------------------------------------

function StreakBanner({ streak }: { streak: ProspectingStreak }) {
  const hasStreak = streak.currentDays > 0;
  const bannerClass = hasStreak
    ? 'rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4'
    : 'rounded-xl bg-gradient-to-r from-gray-400 to-gray-500 text-white p-4';

  return (
    <div className={bannerClass}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Streak info */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <svg className="h-6 w-6 text-amber-300" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
            </svg>
            <div>
              <span className="text-xl font-bold">
                {hasStreak ? `${streak.currentDays}-day streak` : 'No active streak'}
              </span>
              {streak.isActiveToday && (
                <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
                  Active today
                </span>
              )}
            </div>
          </div>
          <div className="hidden border-l border-white/30 pl-4 sm:block">
            <span className="text-sm text-white/80">Best: </span>
            <span className="font-semibold">{streak.longestDays} days</span>
          </div>
        </div>

        {/* Weekly progress */}
        <div className="flex min-w-48 flex-1 flex-col gap-1 sm:max-w-xs">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/80">Weekly doors</span>
            <span className="font-semibold">
              {streak.weeklyProgress}/{streak.weeklyTarget}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/25">
            <div
              className="h-2 rounded-full bg-white transition-all duration-500"
              style={{ width: `${streak.weeklyProgressPercent}%` }}
            />
          </div>
          <span className="text-xs text-white/70">{streak.weeklyProgressPercent}% of weekly target</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversion Funnel
// ---------------------------------------------------------------------------

interface FunnelStage {
  label: string;
  count: number;
  color: string;
  rateLabel: string | null;
  rate: number | null;
}

function ConversionFunnelCard({ funnel }: { funnel: ReturnType<typeof useProspectingMetrics>['funnel'] }) {
  const maxCount = Math.max(funnel.fieldContacts, 1);

  const stages: FunnelStage[] = [
    {
      label: 'Field Contacts',
      count: funnel.fieldContacts,
      color: '#6366f1',
      rateLabel: 'Phone capture',
      rate: funnel.rates.phoneCapture,
    },
    {
      label: 'With Phone',
      count: funnel.withPhone,
      color: '#16a34a',
      rateLabel: 'Contact to appraisal',
      rate: funnel.rates.contactToAppraisal,
    },
    {
      label: 'Appraisals',
      count: funnel.appraisals,
      color: '#f59e0b',
      rateLabel: 'Appraisal to listed',
      rate: funnel.rates.appraisalToListed,
    },
    {
      label: 'Listed',
      count: funnel.listed,
      color: '#2563eb',
      rateLabel: 'Listed to settled',
      rate: funnel.rates.listedToSettled,
    },
    {
      label: 'Settled',
      count: funnel.settled,
      color: '#059669',
      rateLabel: null,
      rate: null,
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-3">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Conversion Funnel</h2>

      {funnel.fieldContacts === 0 ? (
        <p className="text-sm text-gray-400">
          No field contacts yet. Start prospecting to see your conversion funnel.
        </p>
      ) : (
        <div className="space-y-3">
          {stages.map((stage) => {
            const pct = stage.count === 0 ? 0 : Math.max((stage.count / maxCount) * 100, 3);
            return (
              <div key={stage.label}>
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="text-sm text-gray-700">{stage.label}</span>
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">
                      {stage.count}
                    </span>
                  </div>
                  {stage.rate !== null && (
                    <span className="text-xs text-gray-400">
                      {stage.rateLabel}: {stage.rate}%
                    </span>
                  )}
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: stage.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini bar chart (4-week, CSS bars, no recharts)
// ---------------------------------------------------------------------------

function MiniBarChart({
  points,
  label,
  color,
}: {
  points: WeeklyTrendPoint[];
  label: string;
  color: string;
}) {
  const maxVal = Math.max(...points.map((p) => p.value), 1);

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-gray-500">{label}</p>
      <div className="flex items-end gap-1.5" style={{ height: 60 }}>
        {points.map((point) => {
          const heightPct = point.value === 0 ? 4 : Math.max((point.value / maxVal) * 100, 8);
          return (
            <div key={point.weekLabel} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] font-medium text-gray-600">{point.value}</span>
              <div
                className="w-full rounded-t"
                style={{ height: `${heightPct}%`, backgroundColor: color, minHeight: 3 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {points.map((point) => (
          <div key={point.weekLabel} className="flex-1 text-center">
            <span className="text-[10px] text-gray-400">{point.weekLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyTrendsCard({
  weeklyDoors,
  weeklyContacts,
}: {
  weeklyDoors: WeeklyTrendPoint[];
  weeklyContacts: WeeklyTrendPoint[];
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Weekly Trends</h2>
      <div className="space-y-5">
        <MiniBarChart points={weeklyDoors} label="Doors Knocked" color="#6366f1" />
        <MiniBarChart points={weeklyContacts} label="Contacts Created" color="#16a34a" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Territory / Stale Streets table
// ---------------------------------------------------------------------------

function TerritoryCard({ streets }: { streets: StaleStreet[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-3">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Territory Coverage</h2>

      {streets.length === 0 ? (
        <p className="text-sm text-gray-400">
          No stale streets &mdash; you&apos;re covering your territory well!
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="pb-2 pr-4">Street</th>
                <th className="pb-2 pr-4">Suburb</th>
                <th className="pb-2 pr-4 text-right">Contacts</th>
                <th className="pb-2 pr-4 text-right">Last Visited</th>
                <th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {streets.map((street) => {
                const stale = staleness(street.daysSinceLastContact);
                return (
                  <tr key={`${street.streetName}-${street.suburb}`} className="hover:bg-gray-50">
                    <td className="py-2.5 pr-4 font-medium text-gray-900">{street.streetName}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{street.suburb}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-700">{street.contactCount}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-500">
                      {formatLastVisited(street.daysSinceLastContact)}
                    </td>
                    <td className="py-2.5 text-right">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STALENESS_CHIP[stale]}`}>
                        {STALENESS_LABEL[stale]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today's Summary
// ---------------------------------------------------------------------------

function TodayStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function TodaysSummaryCard({
  today,
}: {
  today: ReturnType<typeof useProspectingMetrics>['today'];
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Today&apos;s Summary</h2>

      <div className="space-y-4">
        <TodayStat
          label="Doors knocked"
          value={String(today.doors)}
          icon={
            <svg className="h-4 w-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          }
        />
        <TodayStat
          label="Sessions"
          value={String(today.sessions)}
          icon={
            <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <TodayStat
          label="Contacts created"
          value={String(today.contactsCreated)}
          icon={
            <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
            </svg>
          }
        />
        <TodayStat
          label="Distance walked"
          value={today.distanceMeters > 0 ? formatKm(today.distanceMeters) : '--'}
          icon={
            <svg className="h-4 w-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          }
        />
        <TodayStat
          label="Phone capture rate"
          value={today.contactsCreated > 0 ? `${today.phoneCaptureRate}%` : '--'}
          icon={
            <svg className="h-4 w-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          }
        />

        {today.durationSeconds > 0 && (
          <TodayStat
            label="Time in field"
            value={formatDuration(today.durationSeconds)}
            icon={
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 2: Inspection Metrics Card
// ---------------------------------------------------------------------------

function InspectionMetricsCard({ inspectionMetrics }: { inspectionMetrics: InspectionMetrics }) {
  const { totalCompleted, avgAttendees, interestDistribution, attendeeToContactRate } = inspectionMetrics;
  const { hot, warm, cold } = interestDistribution;
  const totalInterest = hot + warm + cold;

  const hotPct = totalInterest > 0 ? Math.round((hot / totalInterest) * 100) : 0;
  const warmPct = totalInterest > 0 ? Math.round((warm / totalInterest) * 100) : 0;
  const coldPct = totalInterest > 0 ? 100 - hotPct - warmPct : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Inspection Metrics</h2>

      {totalCompleted === 0 ? (
        <p className="text-sm text-gray-400">No completed inspections yet.</p>
      ) : (
        <div className="space-y-4">
          {/* Key stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Completed</p>
              <p className="mt-0.5 text-xl font-bold text-gray-900">{totalCompleted}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Avg Attendees</p>
              <p className="mt-0.5 text-xl font-bold text-gray-900">{avgAttendees}</p>
            </div>
          </div>

          {/* Interest distribution stacked bar */}
          {totalInterest > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-500">Interest Distribution</p>
              <div className="flex h-3 w-full overflow-hidden rounded-full">
                {hotPct > 0 && (
                  <div
                    className="bg-red-500 transition-all duration-300"
                    style={{ width: `${hotPct}%` }}
                    title={`Hot: ${hot}`}
                  />
                )}
                {warmPct > 0 && (
                  <div
                    className="bg-amber-400 transition-all duration-300"
                    style={{ width: `${warmPct}%` }}
                    title={`Warm: ${warm}`}
                  />
                )}
                {coldPct > 0 && (
                  <div
                    className="bg-blue-400 transition-all duration-300"
                    style={{ width: `${coldPct}%` }}
                    title={`Cold: ${cold}`}
                  />
                )}
              </div>
              <div className="mt-1.5 flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  Hot {hot}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  Warm {warm}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                  Cold {cold}
                </span>
              </div>
            </div>
          )}

          {/* Conversion rate */}
          <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
            <div>
              <p className="text-xs text-gray-500">Attendee-to-Contact Rate</p>
              <p className="mt-0.5 text-lg font-bold text-gray-900">{attendeeToContactRate}%</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50">
              <svg className="h-5 w-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 3: Recommended Areas Card
// ---------------------------------------------------------------------------

function RecommendedAreasCard({ areas }: { areas: RecommendedArea[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-3">
      <h2 className="mb-1 text-sm font-semibold text-gray-900">Where to Prospect Next</h2>
      <p className="mb-4 text-xs text-gray-400">Scored by staleness, contact density, and past listing success</p>

      {areas.length === 0 ? (
        <p className="text-sm text-gray-400">
          No recommendations yet &mdash; start prospecting to build territory data.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="pb-2 pr-4">Street</th>
                <th className="pb-2 pr-4">Suburb</th>
                <th className="pb-2 pr-3 text-center">Score</th>
                <th className="pb-2 pr-4">Reason</th>
                <th className="pb-2 pr-4 text-right">Contacts</th>
                <th className="pb-2 text-right">Last Visit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {areas.map((area) => (
                <tr
                  key={`${area.streetName}-${area.suburb}`}
                  className="hover:bg-gray-50"
                  data-lat={area.averageLatitude}
                  data-lng={area.averageLongitude}
                >
                  <td className="py-2.5 pr-4 font-medium text-gray-900">{area.streetName}</td>
                  <td className="py-2.5 pr-4 text-gray-500">{area.suburb}</td>
                  <td className="py-2.5 pr-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${scoreBadgeClass(area.score)}`}>
                      {area.score}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-500">{area.reason}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-700">{area.contactCount}</td>
                  <td className="py-2.5 text-right text-gray-500">
                    {formatLastVisited(area.daysSinceLastContact)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 3: Multi-Dwelling Buildings Card
// ---------------------------------------------------------------------------

function MultiDwellingCard({ buildings }: { buildings: MultiDwellingBuilding[] }) {
  if (buildings.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-900">Building Coverage</h2>
      <p className="mb-4 text-xs text-gray-400">Multi-unit buildings with tracked visits</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="pb-2 pr-4">Address</th>
              <th className="pb-2 pr-4">Units Visited</th>
              <th className="pb-2 text-right">Last Visit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {buildings.map((building) => (
              <tr key={building.address} className="hover:bg-gray-50">
                <td className="py-2.5 pr-4 font-medium text-gray-900">{building.address}</td>
                <td className="py-2.5 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {building.uniqueUnits.map((unit) => (
                      <span
                        key={unit}
                        className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600"
                      >
                        {unit}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-2.5 text-right text-gray-500">
                  {formatDate(building.lastVisited)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 2: 12-Week Long-term Trends chart
// ---------------------------------------------------------------------------

function LongTermTrendsCard({ points }: { points: WeeklyTrendPoint[] }) {
  const maxVal = Math.max(...points.map((p) => p.value), 1);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-3">
      <h2 className="mb-1 text-sm font-semibold text-gray-900">Long-term Trends</h2>
      <p className="mb-4 text-xs text-gray-400">12-week rolling doors knocked</p>

      <div className="flex items-end gap-1" style={{ height: 100 }}>
        {points.map((point, i) => {
          const heightPct = point.value === 0 ? 2 : Math.max((point.value / maxVal) * 100, 4);
          // Highlight the most recent week
          const isLatest = i === points.length - 1;
          return (
            <div
              key={point.weekLabel}
              className="group relative flex flex-1 flex-col items-center gap-0.5"
            >
              <span className="text-[9px] font-medium text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                {point.value}
              </span>
              <div
                className="w-full rounded-t transition-all duration-300"
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: isLatest ? '#6366f1' : '#a5b4fc',
                  minHeight: 3,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels — only show every 3rd to avoid clutter */}
      <div className="mt-1 flex gap-1">
        {points.map((point, i) => (
          <div key={point.weekLabel} className="flex-1 text-center">
            {i % 3 === 0 || i === points.length - 1 ? (
              <span className="text-[9px] text-gray-400">{point.weekLabel}</span>
            ) : null}
          </div>
        ))}
      </div>

      {/* Summary row */}
      <div className="mt-3 flex gap-4 border-t border-gray-50 pt-3 text-xs text-gray-500">
        <span>
          Total:{' '}
          <span className="font-semibold text-gray-800">
            {points.reduce((s, p) => s + p.value, 0)} doors
          </span>
        </span>
        <span>
          Avg/week:{' '}
          <span className="font-semibold text-gray-800">
            {Math.round(points.reduce((s, p) => s + p.value, 0) / Math.max(points.length, 1))}
          </span>
        </span>
        <span>
          Best week:{' '}
          <span className="font-semibold text-gray-800">
            {Math.max(...points.map((p) => p.value))} doors
          </span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suburb Intelligence Card
// ---------------------------------------------------------------------------

function formatMedianPrice(price: number | null | undefined): string {
  if (!price) return '\u2014';
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(price / 1000)}K`;
}

interface SuburbRow {
  suburb: string;
  totalDwellings: number | undefined;
  yourContacts: number;
  penetrationPct: number | null;
  medianPrice: number | null | undefined;
  dwellingMix: string;
  opportunity: 'High' | 'Medium' | 'Low';
}

function penetrationChipClass(pct: number | null): string {
  if (pct === null) return 'bg-gray-100 text-gray-500';
  if (pct < 1) return 'bg-red-100 text-red-700';
  if (pct <= 5) return 'bg-amber-100 text-amber-700';
  return 'bg-green-100 text-green-700';
}

function opportunityBadgeClass(opp: 'High' | 'Medium' | 'Low'): string {
  if (opp === 'High') return 'bg-green-100 text-green-700';
  if (opp === 'Medium') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-500';
}

function SuburbIntelligenceCard({
  suburbStats,
  suburbStatsLoading,
  getSuburbPenetration,
  staleStreets,
}: {
  suburbStats: SuburbStats[];
  suburbStatsLoading: boolean;
  getSuburbPenetration: (suburb: string, contactCount: number) => number | null;
  staleStreets: StaleStreet[];
}) {
  const suburbRows: SuburbRow[] = useMemo(() => {
    if (suburbStats.length === 0) return [];

    // Aggregate contact counts per suburb from street-level tracking data
    const contactCounts = new Map<string, number>();
    for (const street of staleStreets) {
      if (!street.suburb) continue;
      const key = street.suburb.toLowerCase();
      contactCounts.set(key, (contactCounts.get(key) ?? 0) + street.contactCount);
    }

    const rows: SuburbRow[] = suburbStats.map((stat) => {
      const yourContacts = contactCounts.get(stat.suburb.toLowerCase()) ?? 0;
      const penetrationPct = getSuburbPenetration(stat.suburb, yourContacts);

      const houses = stat.separate_houses ?? 0;
      const semis = stat.semi_detached ?? 0;
      const flats = stat.flats_units ?? 0;
      const total = stat.total_dwellings || 1;
      const housePct = Math.round((houses / total) * 100);
      const flatPct = Math.round((flats / total) * 100);
      const semiPct = Math.round((semis / total) * 100);
      const dwellingMix = `${housePct}% house / ${semiPct}% semi / ${flatPct}% flat`;

      const isHighOpportunity =
        (penetrationPct === null || penetrationPct < 2) &&
        (stat.median_sale_price ?? 0) > 700_000;
      const opportunity: 'High' | 'Medium' | 'Low' = isHighOpportunity
        ? 'High'
        : penetrationPct !== null && penetrationPct >= 5
          ? 'Low'
          : 'Medium';

      return {
        suburb: stat.suburb,
        totalDwellings: stat.total_dwellings,
        yourContacts,
        penetrationPct,
        medianPrice: stat.median_sale_price,
        dwellingMix,
        opportunity,
      };
    });

    // Sort by penetration ascending — nulls (no contacts) first
    return rows.sort((a, b) => {
      if (a.penetrationPct === null && b.penetrationPct === null) return 0;
      if (a.penetrationPct === null) return -1;
      if (b.penetrationPct === null) return 1;
      return a.penetrationPct - b.penetrationPct;
    });
  }, [suburbStats, staleStreets, getSuburbPenetration]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Suburb Intelligence</h2>
          <p className="mt-0.5 text-xs text-gray-400">ABS dwelling data cross-referenced with your contact coverage</p>
        </div>
        {suburbStatsLoading && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        )}
      </div>

      {!suburbStatsLoading && suburbRows.length === 0 ? (
        <p className="text-sm text-gray-400">
          No suburb data available &mdash; import ABS data to see penetration analysis.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="pb-2 pr-4">Suburb</th>
                <th className="pb-2 pr-4 text-right">Total Dwellings</th>
                <th className="pb-2 pr-4 text-right">Your Contacts</th>
                <th className="pb-2 pr-4 text-center">Penetration %</th>
                <th className="pb-2 pr-4 text-right">Median Price</th>
                <th className="pb-2 pr-4">Dwelling Mix</th>
                <th className="pb-2 text-center">Opportunity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {suburbRows.map((row) => (
                <tr key={row.suburb} className="hover:bg-gray-50">
                  <td className="py-2.5 pr-4 font-medium text-gray-900">{row.suburb}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-700">
                    {(row.totalDwellings ?? 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-gray-700">{row.yourContacts}</td>
                  <td className="py-2.5 pr-4 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${penetrationChipClass(row.penetrationPct)}`}>
                      {row.penetrationPct !== null ? `${row.penetrationPct}%` : '0%'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-gray-700">
                    {formatMedianPrice(row.medianPrice)}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-gray-500">{row.dwellingMix}</td>
                  <td className="py-2.5 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${opportunityBadgeClass(row.opportunity)}`}>
                      {row.opportunity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Import Section
// ---------------------------------------------------------------------------

function parseSoldHistoryCSV(csvText: string): Omit<SoldRecord, 'id'>[] {
  const lines = csvText.trim().split('\n');
  // Skip header row if present
  const dataLines = lines[0]?.toLowerCase().includes('address') ? lines.slice(1) : lines;
  return dataLines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      return {
        address: cols[0] ?? '',
        suburb: cols[1] ?? '',
        postcode: cols[2] ?? '',
        property_type: cols[3] ?? 'house',
        sale_price: Number(cols[4]) || 0,
        sale_date: cols[5] ?? new Date().toISOString().slice(0, 10),
        source: 'csv',
      };
    })
    .filter((r) => Boolean(r.address) && Boolean(r.suburb));
}

function parseSuburbStatsCSV(csvText: string): Omit<SuburbStats, 'id'>[] {
  const lines = csvText.trim().split('\n');
  const dataLines = lines[0]?.toLowerCase().includes('suburb') ? lines.slice(1) : lines;
  return dataLines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      return {
        suburb: cols[0] ?? '',
        state: cols[1] ?? '',
        postcode: cols[2] ?? '',
        total_dwellings: Number(cols[3]) || 0,
        separate_houses: Number(cols[4]) || 0,
        flats_units: Number(cols[5]) || 0,
        population: Number(cols[6]) || 0,
        median_sale_price: Number(cols[7]) || 0,
      };
    })
    .filter((r) => Boolean(r.suburb) && Boolean(r.state));
}

function DataImportSection({
  importSoldHistoryCSV,
  importSuburbStatsCSV,
}: {
  importSoldHistoryCSV: (records: Omit<SoldRecord, 'id' | 'created_at'>[]) => Promise<number>;
  importSuburbStatsCSV: (records: Omit<SuburbStats, 'id'>[]) => Promise<number>;
}) {
  const [open, setOpen] = useState(false);
  const [soldResult, setSoldResult] = useState<string | null>(null);
  const [statsResult, setStatsResult] = useState<string | null>(null);
  const [soldLoading, setSoldLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const soldInputRef = useRef<HTMLInputElement>(null);
  const statsInputRef = useRef<HTMLInputElement>(null);

  const handleSoldCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSoldLoading(true);
    setSoldResult(null);
    try {
      const text = await file.text();
      const records = parseSoldHistoryCSV(text);
      const count = await importSoldHistoryCSV(records);
      setSoldResult(`Imported ${count} records`);
    } catch {
      setSoldResult('Import failed — check CSV format');
    } finally {
      setSoldLoading(false);
      if (soldInputRef.current) soldInputRef.current.value = '';
    }
  };

  const handleStatsCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatsLoading(true);
    setStatsResult(null);
    try {
      const text = await file.text();
      const records = parseSuburbStatsCSV(text);
      const count = await importSuburbStatsCSV(records);
      setStatsResult(`Imported ${count} records`);
    } catch {
      setStatsResult('Import failed — check CSV format');
    } finally {
      setStatsLoading(false);
      if (statsInputRef.current) statsInputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between"
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Data Import</h2>
          <p className="mt-0.5 text-xs text-gray-400">Import sold history and suburb stats from CSV</p>
        </div>
        <svg
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Sold History Import */}
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Import Sold History
            </h3>
            <p className="mt-1 text-xs text-gray-400">
              CSV format: <span className="font-mono">address, suburb, postcode, property_type, sale_price, sale_date</span>
            </p>
            <div className="mt-4 flex items-center gap-3">
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {soldLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                      </svg>
                      Import Sold History (CSV)
                    </>
                  )}
                </span>
                <input
                  ref={soldInputRef}
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={handleSoldCSV}
                  disabled={soldLoading}
                />
              </label>
            </div>
            {soldResult && (
              <p className={`mt-2 text-xs font-medium ${soldResult.startsWith('Imported') ? 'text-green-600' : 'text-red-600'}`}>
                {soldResult}
              </p>
            )}
          </div>

          {/* Suburb Stats Import */}
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Import Suburb Stats
            </h3>
            <p className="mt-1 text-xs text-gray-400">
              CSV format: <span className="font-mono">suburb, state, postcode, total_dwellings, separate_houses, flats_units, population, median_sale_price</span>
            </p>
            <div className="mt-4 flex items-center gap-3">
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {statsLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                      </svg>
                      Import Suburb Stats (CSV)
                    </>
                  )}
                </span>
                <input
                  ref={statsInputRef}
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={handleStatsCSV}
                  disabled={statsLoading}
                />
              </label>
            </div>
            {statsResult && (
              <p className={`mt-2 text-xs font-medium ${statsResult.startsWith('Imported') ? 'text-green-600' : 'text-red-600'}`}>
                {statsResult}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ProspectingReports() {
  const fetchProperties = usePropertyStore((s) => s.fetchProperties);
  const fetchSessions = useTrackingStore((s) => s.fetchSessions);
  const fetchAllAnnotations = useTrackingStore((s) => s.fetchAllAnnotations);
  const fetchInspections = useInspectionStore((s) => s.fetchInspections);

  // Data enrichment
  const suburbStats = useDataEnrichmentStore((s) => s.suburbStats);
  const suburbStatsLoading = useDataEnrichmentStore((s) => s.suburbStatsLoading);
  const fetchSuburbStats = useDataEnrichmentStore((s) => s.fetchSuburbStats);
  const getSuburbPenetration = useDataEnrichmentStore((s) => s.getSuburbPenetration);
  const importSoldHistoryCSV = useDataEnrichmentStore((s) => s.importSoldHistoryCSV);
  const importSuburbStatsCSV = useDataEnrichmentStore((s) => s.importSuburbStatsCSV);

  useEffect(() => {
    fetchProperties();
    fetchSessions();
    fetchAllAnnotations();
    fetchInspections();
    fetchSuburbStats();
  }, [fetchProperties, fetchSessions, fetchAllAnnotations, fetchInspections, fetchSuburbStats]);

  const metrics = useProspectingMetrics();
  const {
    today,
    thisWeek,
    trends,
    funnel,
    staleStreets,
    weeklyDoorsTrend,
    weeklyContactsTrend,
    streak,
    inspectionMetrics,
    recommendedAreas,
    multiDwellingBuildings,
    monthlyDoorsTrend,
  } = metrics;

  const hasSessions = streak.currentDays > 0 || streak.longestDays > 0 || streak.weeklyProgress > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Prospecting Reports</h1>
        <p className="text-sm text-gray-500">Field activity, conversion metrics, and territory health</p>
      </div>

      {/* Streak Banner — only when the user has any recorded activity */}
      {hasSessions && <StreakBanner streak={streak} />}

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Doors This Week"
          value={thisWeek.doors}
          trend={trends.doors}
          iconBg="bg-indigo-50 text-indigo-600"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          }
        />
        <KpiCard
          label="Contacts Created"
          value={thisWeek.contactsCreated}
          trend={trends.contacts}
          iconBg="bg-green-50 text-green-600"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
            </svg>
          }
        />
        <KpiCard
          label="Phone Capture Rate"
          value={thisWeek.contactsCreated > 0 ? `${thisWeek.phoneCaptureRate}%` : '--'}
          trend={trends.phoneCaptureRate}
          iconBg="bg-purple-50 text-purple-600"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          }
        />
        <KpiCard
          label="Distance Walked"
          value={thisWeek.distanceMeters > 0 ? formatKm(thisWeek.distanceMeters) : '--'}
          trend={trends.distance}
          iconBg="bg-amber-50 text-amber-600"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          }
        />
      </div>

      {/* Row 2: Conversion Funnel + Weekly Trends */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <ConversionFunnelCard funnel={funnel} />
        <WeeklyTrendsCard weeklyDoors={weeklyDoorsTrend} weeklyContacts={weeklyContactsTrend} />
      </div>

      {/* Row 3: Territory Table + Today's Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <TerritoryCard streets={staleStreets} />
        <TodaysSummaryCard today={today} />
      </div>

      {/* Row 4: Recommended Areas + Inspection Metrics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <RecommendedAreasCard areas={recommendedAreas} />
        <InspectionMetricsCard inspectionMetrics={inspectionMetrics} />
      </div>

      {/* Row 5: 12-Week Trends + Building Coverage (conditional) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <LongTermTrendsCard points={monthlyDoorsTrend} />
        {multiDwellingBuildings.length > 0 && (
          <MultiDwellingCard buildings={multiDwellingBuildings} />
        )}
      </div>

      {/* Row 6: Suburb Intelligence (full width) */}
      <SuburbIntelligenceCard
        suburbStats={suburbStats}
        suburbStatsLoading={suburbStatsLoading}
        getSuburbPenetration={getSuburbPenetration}
        staleStreets={staleStreets}
      />

      {/* Row 7: Data Import (collapsible, full width) */}
      <DataImportSection
        importSoldHistoryCSV={importSoldHistoryCSV}
        importSuburbStatsCSV={importSuburbStatsCSV}
      />
    </div>
  );
}
