'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  useCRMStore,
  useAuthStore,
  usePropertyStore,
  useTaskStore,
  useInspectionStore,
  useTrackingStore,
} from '@realestate-crm/hooks';
import type { ActivityWithContact, Property, Task, Inspection } from '@realestate-crm/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${value.toLocaleString()}`;
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function formatInspectionTime(date: Date): string {
  return date.toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatTaskDue(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function formatMeters(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${meters} m`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES: Property['status'][] = ['withdrawn', 'settled', 'leased'];

const PIPELINE_STAGES: {
  status: Property['status'];
  label: string;
  color: string;
}[] = [
  { status: 'appraisal', label: 'Appraisal', color: '#6366f1' },
  { status: 'available', label: 'Listed', color: '#16a34a' },
  { status: 'under_offer', label: 'Under Offer', color: '#f59e0b' },
  { status: 'exchanged', label: 'Exchanged', color: '#2563eb' },
];

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  call: 'Call',
  meeting: 'Meeting',
  email: 'Email',
};

const TASK_TYPE_LABELS: Record<string, string> = {
  task: 'Task',
  appointment: 'Appt',
  follow_up: 'Follow-up',
  inspection_reminder: 'Inspection',
};

const TASK_TYPE_COLORS: Record<string, string> = {
  task: 'bg-gray-100 text-gray-600',
  appointment: 'bg-blue-50 text-blue-700',
  follow_up: 'bg-purple-50 text-purple-700',
  inspection_reminder: 'bg-amber-50 text-amber-700',
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  // --- Store subscriptions ---
  const contacts = useCRMStore((s) => s.contacts);
  const recentActivities = useCRMStore((s) => s.activities);
  const fetchRecentActivities = useCRMStore((s) => s.fetchActivities);
  const fetchContacts = useCRMStore((s) => s.fetchContacts);

  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const activeTeam = useAuthStore((s) => s.activeTeam);

  const properties = usePropertyStore((s) => s.properties);
  const fetchProperties = usePropertyStore((s) => s.fetchProperties);

  const tasks = useTaskStore((s) => s.tasks);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);

  const inspections = useInspectionStore((s) => s.inspections);
  const fetchInspections = useInspectionStore((s) => s.fetchInspections);

  const sessions = useTrackingStore((s) => s.sessions);
  const allAnnotations = useTrackingStore((s) => s.allAnnotations);
  const fetchSessions = useTrackingStore((s) => s.fetchSessions);
  const fetchAllAnnotations = useTrackingStore((s) => s.fetchAllAnnotations);

  // --- Data fetching on mount ---
  useEffect(() => {
    fetchContacts();
    fetchProperties();
    fetchTasks();
    fetchInspections();
    fetchRecentActivities();
    fetchSessions();
    fetchAllAnnotations();
  }, [
    fetchContacts,
    fetchProperties,
    fetchTasks,
    fetchInspections,
    fetchRecentActivities,
    fetchSessions,
    fetchAllAnnotations,
  ]);

  // ---------------------------------------------------------------------------
  // Row 1: KPI cards
  // ---------------------------------------------------------------------------

  const kpis = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const activeListings = properties.filter((p) => p.status === 'available').length;

    const pipelineValue = properties
      .filter((p) => !TERMINAL_STATUSES.includes(p.status))
      .reduce((sum, p) => sum + (p.advertised_price ?? p.appraisal_price ?? 0), 0);

    const overdueTasks = tasks.filter(
      (t) => t.status !== 'completed' && t.due_at != null && new Date(t.due_at).getTime() < now
    ).length;

    const newContacts = contacts.filter(
      (c) => new Date(c.created_at || '').getTime() >= weekAgo
    ).length;

    return { activeListings, pipelineValue, overdueTasks, newContacts };
  }, [properties, tasks, contacts]);

  // ---------------------------------------------------------------------------
  // Row 2: Property pipeline
  // ---------------------------------------------------------------------------

  const pipelineData = useMemo(() => {
    return PIPELINE_STAGES.map((stage) => {
      const stageProps = properties.filter((p) => p.status === stage.status);
      const count = stageProps.length;
      const value = stageProps.reduce(
        (sum, p) => sum + (p.advertised_price ?? p.appraisal_price ?? 0),
        0
      );
      return { ...stage, count, value };
    });
  }, [properties]);

  const maxPipelineCount = useMemo(
    () => Math.max(...pipelineData.map((s) => s.count), 1),
    [pipelineData]
  );

  // ---------------------------------------------------------------------------
  // Row 2: Upcoming inspections
  // ---------------------------------------------------------------------------

  const upcomingInspections = useMemo((): Inspection[] => {
    const now = new Date();
    return inspections
      .filter(
        (i) =>
          i.status !== 'cancelled' && new Date(i.scheduled_at).getTime() >= now.getTime()
      )
      .sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      )
      .slice(0, 5);
  }, [inspections]);

  // ---------------------------------------------------------------------------
  // Row 3: Tasks
  // ---------------------------------------------------------------------------

  const { overdueTasks: overdueTaskList, todayTasks } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const overdue: Task[] = [];
    const today: Task[] = [];

    for (const t of tasks) {
      if (t.status === 'completed') continue;
      if (!t.due_at) continue;
      const dueMs = new Date(t.due_at).getTime();
      if (dueMs < startOfToday.getTime()) {
        overdue.push(t);
      } else if (dueMs <= endOfToday.getTime()) {
        today.push(t);
      }
    }

    return {
      overdueTasks: overdue.sort(
        (a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()
      ),
      todayTasks: today.sort(
        (a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()
      ),
    };
  }, [tasks]);

  const dashboardTasks = useMemo(
    () => [...overdueTaskList, ...todayTasks].slice(0, 6),
    [overdueTaskList, todayTasks]
  );

  // ---------------------------------------------------------------------------
  // Row 3: Field activity
  // ---------------------------------------------------------------------------

  const fieldActivity = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const weeklySessions = sessions.filter(
      (s) => new Date(s.started_at).getTime() >= weekAgo
    );

    const totalDistanceMeters = weeklySessions.reduce(
      (sum, s) => sum + (s.total_distance_meters ?? 0),
      0
    );

    const doorsKnocked = allAnnotations.filter(
      (a) => new Date(a.created_at || '').getTime() >= weekAgo
    ).length;

    return {
      sessionCount: weeklySessions.length,
      totalDistanceMeters,
      doorsKnocked,
    };
  }, [sessions, allAnnotations]);

  // ---------------------------------------------------------------------------
  // Row 3: Recent activity
  // ---------------------------------------------------------------------------

  const displayedActivities = useMemo(
    () => recentActivities.slice(0, 5),
    [recentActivities]
  );

  // ---------------------------------------------------------------------------
  // Greeting
  // ---------------------------------------------------------------------------

  const displayName =
    profile?.display_name ||
    activeTeam?.name ||
    (user?.email ? user.email.split('@')[0] : null);

  const greeting = displayName ? `Welcome back, ${displayName}` : 'Welcome back';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}</h1>
          <p className="text-sm text-gray-500">
            {isDemoMode
              ? 'Running in demo mode — data is stored locally'
              : 'Your real estate CRM overview'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/properties/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Listing
          </Link>
          <Link
            href="/contacts"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Add Contact
          </Link>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Active Listings"
          value={kpis.activeListings}
          href="/properties"
          iconColor="bg-green-50 text-green-600"
          valueColor="text-green-700"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 22V12h6v10" />
            </svg>
          }
        />
        <KpiCard
          label="Pipeline Value"
          value={formatPrice(kpis.pipelineValue)}
          href="/pipeline"
          iconColor="bg-blue-50 text-blue-600"
          valueColor="text-blue-700"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 12v-2M4.93 4.93l1.414 1.414M17.657 17.657l1.414 1.414M4.93 19.07l1.414-1.414M17.657 6.343l1.414-1.414" />
            </svg>
          }
        />
        <KpiCard
          label="Overdue Tasks"
          value={kpis.overdueTasks}
          href="/tasks"
          iconColor={kpis.overdueTasks > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'}
          valueColor={kpis.overdueTasks > 0 ? 'text-red-600' : 'text-gray-700'}
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <KpiCard
          label="This Week's Contacts"
          value={kpis.newContacts}
          href="/contacts"
          iconColor="bg-purple-50 text-purple-600"
          valueColor="text-purple-700"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
            </svg>
          }
        />
      </div>

      {/* Row 2: Property Pipeline + Upcoming Inspections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">

        {/* Property Pipeline */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Property Pipeline</h2>
            <Link
              href="/pipeline"
              className="text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              View pipeline
            </Link>
          </div>

          {properties.length === 0 ? (
            <p className="text-sm text-gray-400">
              No properties yet. Add your first listing to see the pipeline.
            </p>
          ) : (
            <div className="space-y-3">
              {pipelineData.map((stage) => (
                <PipelineStageBar
                  key={stage.status}
                  label={stage.label}
                  count={stage.count}
                  value={stage.value}
                  color={stage.color}
                  maxCount={maxPipelineCount}
                />
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Inspections */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Upcoming Inspections</h2>
            <Link
              href="/inspections"
              className="text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              View all
            </Link>
          </div>

          {upcomingInspections.length === 0 ? (
            <p className="text-sm text-gray-400">No upcoming inspections scheduled.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {upcomingInspections.map((inspection) => (
                <InspectionRow key={inspection.id} inspection={inspection} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Tasks Due + Field Activity + Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">

        {/* Tasks Due */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Tasks Due</h2>
            <Link
              href="/tasks"
              className="text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              View all
            </Link>
          </div>

          {dashboardTasks.length === 0 ? (
            <p className="text-sm text-gray-400">No tasks overdue or due today.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {dashboardTasks.map((task) => {
                const isOverdue =
                  overdueTaskList.some((t) => t.id === task.id);
                return (
                  <TaskRow key={task.id} task={task} isOverdue={isOverdue} />
                );
              })}
            </div>
          )}
        </div>

        {/* Field Activity */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Field Activity</h2>
            <Link
              href="/tracking"
              className="text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              View
            </Link>
          </div>

          <div className="space-y-4">
            <FieldStat
              label="Sessions this week"
              value={String(fieldActivity.sessionCount)}
              icon={
                <svg className="h-4 w-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
            <FieldStat
              label="Distance walked"
              value={
                fieldActivity.totalDistanceMeters > 0
                  ? formatMeters(fieldActivity.totalDistanceMeters)
                  : '--'
              }
              icon={
                <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              }
            />
            <FieldStat
              label="Doors knocked"
              value={String(fieldActivity.doorsKnocked)}
              icon={
                <svg className="h-4 w-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              }
            />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
          </div>

          {displayedActivities.length === 0 ? (
            <p className="text-sm text-gray-400">
              No activity yet. Start by adding notes to your contacts.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {displayedActivities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  href,
  icon,
  iconColor,
  valueColor,
}: {
  label: string;
  value: string | number;
  href: string;
  icon: React.ReactNode;
  iconColor: string;
  valueColor: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-gray-300 hover:bg-gray-50"
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={`mt-0.5 text-2xl font-bold ${valueColor}`}>{value}</p>
        </div>
      </div>
    </Link>
  );
}

function PipelineStageBar({
  label,
  count,
  value,
  color,
  maxCount,
}: {
  label: string;
  count: number;
  value: number;
  color: string;
  maxCount: number;
}) {
  const pct = count === 0 ? 0 : Math.max((count / maxCount) * 100, 4);

  return (
    <Link href="/pipeline" className="group block">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">
            {count}
          </span>
        </div>
        {value > 0 && (
          <span className="text-xs text-gray-500">{formatPrice(value)}</span>
        )}
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full transition-all duration-300 group-hover:opacity-80"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </Link>
  );
}

function InspectionRow({ inspection }: { inspection: Inspection }) {
  const address =
    inspection.property?.address ?? 'Unknown address';
  const suburb = inspection.property?.suburb;
  const displayAddress = suburb ? `${address}, ${suburb}` : address;
  const scheduledDate = new Date(inspection.scheduled_at);
  const typeLabel =
    inspection.type === 'open_home' ? 'Open Home' : 'Private';
  const attendeeCount = inspection.attendees?.length ?? 0;

  return (
    <Link
      href={`/properties/${inspection.property_id}`}
      className="flex items-start gap-3 py-3 -mx-2 px-2 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{displayAddress}</p>
        <p className="text-xs text-gray-500">{formatInspectionTime(scheduledDate)}</p>
      </div>
      <div className="shrink-0 text-right">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            inspection.type === 'open_home'
              ? 'bg-green-50 text-green-700'
              : 'bg-purple-50 text-purple-700'
          }`}
        >
          {typeLabel}
        </span>
        {attendeeCount > 0 && (
          <p className="mt-0.5 text-xs text-gray-400">{attendeeCount} attending</p>
        )}
      </div>
    </Link>
  );
}

function TaskRow({ task, isOverdue }: { task: Task; isOverdue: boolean }) {
  const contactName =
    task.contact
      ? [task.contact.first_name, task.contact.last_name].filter(Boolean).join(' ')
      : null;

  const typeBadge = TASK_TYPE_COLORS[task.type] ?? 'bg-gray-100 text-gray-600';
  const typeLabel = TASK_TYPE_LABELS[task.type] ?? task.type;

  return (
    <Link
      href="/tasks"
      className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <div
        className={`mt-0.5 flex h-2 w-2 shrink-0 rounded-full ${
          isOverdue ? 'bg-red-500' : 'bg-gray-300'
        }`}
        style={{ marginTop: '0.45rem' }}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${
            isOverdue ? 'text-red-700' : 'text-gray-900'
          }`}
        >
          {task.title}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${typeBadge}`}>
            {typeLabel}
          </span>
          {contactName && (
            <span className="truncate text-xs text-gray-500">{contactName}</span>
          )}
        </div>
      </div>
      {task.due_at && (
        <span
          className={`shrink-0 text-xs font-medium ${
            isOverdue ? 'text-red-500' : 'text-gray-400'
          }`}
        >
          {formatTaskDue(task.due_at)}
        </span>
      )}
    </Link>
  );
}

function FieldStat({
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
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function ActivityRow({ activity }: { activity: ActivityWithContact }) {
  const contactName =
    [activity.contact?.first_name, activity.contact?.last_name]
      .filter(Boolean)
      .join(' ') || 'Unknown';

  const typeLabel = ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type;
  const timeAgo = getTimeAgo(new Date(activity.created_at || ''));

  const typeBadgeClass: Record<string, string> = {
    note: 'bg-gray-100 text-gray-600',
    call: 'bg-blue-50 text-blue-700',
    meeting: 'bg-green-50 text-green-700',
    email: 'bg-purple-50 text-purple-700',
  };

  const badgeClass = typeBadgeClass[activity.type] ?? 'bg-gray-100 text-gray-600';

  return (
    <Link
      href={`/contacts/${activity.contact_id}`}
      className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {activity.type === 'call' && (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          )}
          {activity.type === 'meeting' && (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
          )}
          {activity.type === 'email' && (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          )}
          {(activity.type === 'note' || !['call', 'meeting', 'email'].includes(activity.type)) && (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          )}
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-900">
          <span className="font-medium">{contactName}</span>
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${badgeClass}`}>
            {typeLabel}
          </span>
          {activity.content && (
            <span className="truncate text-xs text-gray-500">{activity.content}</span>
          )}
        </div>
      </div>

      <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">{timeAgo}</span>
    </Link>
  );
}
