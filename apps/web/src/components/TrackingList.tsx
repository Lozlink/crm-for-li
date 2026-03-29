'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTrackingStore } from '@realestate-crm/hooks';
import type { TrackingSession } from '@realestate-crm/types';

type TimeWindow = '7d' | '30d' | 'all';

const TIME_WINDOW_LABELS: Record<TimeWindow, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
};

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '-';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDistance(meters?: number): string {
  if (!meters || meters <= 0) return '-';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatSessionDate(session: TrackingSession) {
  const start = new Date(session.started_at);
  const weekday = start.toLocaleDateString('en-AU', { weekday: 'short' });
  const date = start.toLocaleDateString('en-AU', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const startTime = start.toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
  });

  let endTime = '';
  if (session.completed_at) {
    const end = new Date(session.completed_at);
    endTime = end.toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return { weekday, date, startTime, endTime };
}

function filterByWindow(sessions: TrackingSession[], window: TimeWindow): TrackingSession[] {
  if (window === 'all') return sessions;
  const now = Date.now();
  const cutoff = window === '7d'
    ? now - 7 * 24 * 60 * 60 * 1000
    : now - 30 * 24 * 60 * 60 * 1000;
  return sessions.filter((s) => new Date(s.started_at).getTime() >= cutoff);
}

export default function TrackingList() {
  const router = useRouter();
  const sessions = useTrackingStore((s) => s.sessions);
  const isLoading = useTrackingStore((s) => s.isLoading);
  const fetchSessions = useTrackingStore((s) => s.fetchSessions);
  const allAnnotations = useTrackingStore((s) => s.allAnnotations);
  const fetchAllAnnotations = useTrackingStore((s) => s.fetchAllAnnotations);

  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d');

  useEffect(() => {
    fetchSessions();
    fetchAllAnnotations();
  }, [fetchSessions, fetchAllAnnotations]);

  // Count annotations per session
  const annotationCountBySession = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ann of allAnnotations) {
      counts[ann.session_id] = (counts[ann.session_id] ?? 0) + 1;
    }
    return counts;
  }, [allAnnotations]);

  const filteredSessions = useMemo(
    () => filterByWindow(sessions, timeWindow),
    [sessions, timeWindow]
  );

  if (isLoading && sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Field Activity</h1>
        <p className="text-sm text-gray-500">
          {filteredSessions.length}{' '}
          {filteredSessions.length === 1 ? 'session' : 'sessions'}
          {timeWindow !== 'all' && ` in ${TIME_WINDOW_LABELS[timeWindow].toLowerCase()}`}
        </p>
      </div>

      {/* Time window filter chips */}
      <div className="mb-4 flex items-center gap-2">
        {(Object.entries(TIME_WINDOW_LABELS) as [TimeWindow, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTimeWindow(key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              timeWindow === key
                ? 'border-transparent bg-primary-600 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filteredSessions.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
            />
          </svg>
          <p className="mt-4 text-sm text-gray-500">
            {sessions.length === 0
              ? 'No field activity yet. Start tracking on the mobile app.'
              : `No sessions in ${TIME_WINDOW_LABELS[timeWindow].toLowerCase()}. Try a wider time window.`}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Distance
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Notes
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredSessions.map((session) => {
                const { weekday, date, startTime, endTime } =
                  formatSessionDate(session);
                const annotationCount = annotationCountBySession[session.id] ?? 0;
                return (
                  <tr
                    key={session.id}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                    onClick={() => router.push(`/tracking/${session.id}`)}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/tracking/${session.id}`}
                        className="block"
                      >
                        <span className="text-sm font-medium text-gray-900">
                          {weekday}, {date}
                        </span>
                        <br />
                        <span className="text-xs text-gray-500">
                          {startTime}
                          {endTime ? ` - ${endTime}` : ''}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDuration(session.duration_seconds)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDistance(session.total_distance_meters)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {annotationCount > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                          {annotationCount}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          session.status === 'completed'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-yellow-50 text-yellow-700'
                        }`}
                      >
                        {session.status === 'completed'
                          ? 'Completed'
                          : 'Active'}
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
