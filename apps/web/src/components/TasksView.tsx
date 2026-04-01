'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTaskStore, useSmsCampaignStore } from '@realestate-crm/hooks';
import type { Task, TaskType, TaskStatus, TaskPriority } from '@realestate-crm/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<TaskStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  overdue: 'bg-red-50 text-red-700',
  completed: 'bg-green-50 text-green-700',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pending',
  overdue: 'Overdue',
  completed: 'Completed',
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  high: 'bg-red-50 text-red-700',
  normal: 'bg-blue-50 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

const TYPE_ICONS: Record<TaskType, string> = {
  task: 'T',
  appointment: 'A',
  follow_up: 'F',
  inspection_reminder: 'I',
};

const TYPE_LABELS: Record<TaskType, string> = {
  task: 'Task',
  appointment: 'Appointment',
  follow_up: 'Follow Up',
  inspection_reminder: 'Inspection',
};

const TYPE_COLORS: Record<TaskType, string> = {
  task: 'bg-blue-500',
  appointment: 'bg-purple-500',
  follow_up: 'bg-amber-500',
  inspection_reminder: 'bg-teal-500',
};

const STATUS_FILTER_OPTIONS: { label: string; value: TaskStatus | 'all' }[] = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Completed', value: 'completed' },
];

const TYPE_FILTER_OPTIONS: { label: string; value: TaskType | 'all' }[] = [
  { label: 'All Types', value: 'all' },
  { label: 'Task', value: 'task' },
  { label: 'Appointment', value: 'appointment' },
  { label: 'Follow Up', value: 'follow_up' },
  { label: 'Inspection', value: 'inspection_reminder' },
];

const PRIORITY_FILTER_OPTIONS: { label: string; value: TaskPriority | 'all' }[] = [
  { label: 'All Priorities', value: 'all' },
  { label: 'High', value: 'high' },
  { label: 'Normal', value: 'normal' },
  { label: 'Low', value: 'low' },
];

type ViewMode = 'list' | 'calendar';
type CalendarSpan = 'week' | 'month';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr?: string): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function contactName(task: Task): string {
  const c = Array.isArray(task.contact) ? task.contact[0] : task.contact;
  if (!c) return '\u2014';
  return [c.first_name, c.last_name].filter(Boolean).join(' ');
}

function propertyLabel(task: Task): string {
  const p = Array.isArray(task.property) ? task.property[0] : task.property;
  if (!p) return '\u2014';
  return [p.address, p.suburb].filter(Boolean).join(', ');
}

function isOverdue(task: Task): boolean {
  return task.status === 'overdue';
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday start
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDaysForMonth(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startDay = startOfWeek(firstDay);
  const days: Date[] = [];
  // Always show 6 weeks (42 days) for a consistent grid
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);
    days.push(d);
  }
  return days;
}

function getDaysForWeek(refDate: Date): Date[] {
  const start = startOfWeek(refDate);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TasksView() {
  const tasks = useTaskStore((s) => s.tasks);
  const isLoading = useTaskStore((s) => s.isLoading);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const completeTask = useTaskStore((s) => s.completeTask);
  const createTask = useTaskStore((s) => s.createTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<TaskType | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Multi-select + bulk SMS state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkSmsModal, setShowBulkSmsModal] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Clear selection when view or filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [viewMode, statusFilter, typeFilter, priorityFilter]);

  const filtered = useMemo(() => {
    let result = [...tasks];
    if (statusFilter !== 'all') result = result.filter((t) => t.status === statusFilter);
    if (typeFilter !== 'all') result = result.filter((t) => t.type === typeFilter);
    if (priorityFilter !== 'all') result = result.filter((t) => t.priority === priorityFilter);
    return result;
  }, [tasks, statusFilter, typeFilter, priorityFilter]);

  const selectedTasks = useMemo(
    () => filtered.filter((t) => selectedIds.has(t.id)),
    [filtered, selectedIds],
  );

  const handleComplete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await completeTask(id);
    },
    [completeTask],
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await deleteTask(id);
    },
    [deleteTask],
  );

  const handleToggleSelect = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filtered.map((t) => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [filtered]);

  const allSelected = filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} of {tasks.length} tasks
            {selectedIds.size > 0 && (
              <span className="ml-2 font-medium text-primary-600">
                &mdash; {selectedIds.size} selected
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Bulk SMS — appears when 2+ tasks selected in list view */}
          {viewMode === 'list' && selectedIds.size >= 2 && (
            <button
              onClick={() => setShowBulkSmsModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              Bulk SMS ({selectedIds.size})
            </button>
          )}

          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'calendar'
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Calendar
            </button>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Task
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TaskType | 'all')}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {TYPE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'all')}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {PRIORITY_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <TaskListView
          tasks={filtered}
          allCount={tasks.length}
          isLoading={isLoading}
          expandedId={expandedId}
          selectedIds={selectedIds}
          allSelected={allSelected}
          someSelected={someSelected}
          onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
          onComplete={handleComplete}
          onDelete={handleDelete}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
        />
      ) : (
        <TaskCalendarView tasks={filtered} />
      )}

      {/* Bulk SMS modal */}
      {showBulkSmsModal && (
        <BulkSmsModal
          tasks={selectedTasks}
          onClose={() => setShowBulkSmsModal(false)}
          onSent={() => {
            setShowBulkSmsModal(false);
            setSelectedIds(new Set());
          }}
        />
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreate={async (task) => {
            await createTask(task);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers shared with BulkSmsModal (mirrors mobile generateTaskMessage)
// ---------------------------------------------------------------------------

function generateTaskMessage(type: TaskType, name: string, context?: { property?: string; date?: string; title?: string }): string {
  switch (type) {
    case 'follow_up':
      return `Hi ${name}, following up regarding ${context?.property || 'our recent conversation'}. Would love to chat when you have a moment.`;
    case 'appointment':
      return `Hi ${name}, confirming our appointment${context?.date ? ` on ${context.date}` : ''}. Looking forward to speaking with you.`;
    case 'inspection_reminder':
      return `Hi ${name}, reminder: inspection${context?.property ? ` at ${context.property}` : ''}${context?.date ? ` on ${context.date}` : ''}. See you there!`;
    default:
      return `Hi ${name}, touching base regarding ${context?.title || 'your enquiry'}. Let me know if you have any questions.`;
  }
}

function getTaskContactName(task: Task): string {
  const c = Array.isArray(task.contact) ? task.contact[0] : task.contact;
  if (!c) return 'there';
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'there';
}

function getTaskProperty(task: Task): string | undefined {
  const p = Array.isArray(task.property) ? task.property[0] : task.property;
  return p?.address;
}

function getTaskContactPhone(task: Task): string | undefined {
  const c = Array.isArray(task.contact) ? task.contact[0] : task.contact;
  return c?.phone;
}

// ---------------------------------------------------------------------------
// Bulk SMS Modal
// ---------------------------------------------------------------------------

// Two phases: 'compose' (edit template + review) → 'sending' (step through one at a time)
type BulkSmsPhase = 'compose' | 'sending';

function BulkSmsModal({
  tasks,
  onClose,
  onSent,
}: {
  tasks: Task[];
  onClose: () => void;
  onSent: () => void;
}) {
  const createCampaign = useSmsCampaignStore((s) => s.createCampaign);
  const addRecipients = useSmsCampaignStore((s) => s.addRecipients);

  const tasksWithPhone = useMemo(
    () => tasks.filter((t) => getTaskContactPhone(t)),
    [tasks],
  );

  const defaultTemplate = useMemo(() => {
    const first = tasksWithPhone[0] ?? tasks[0];
    if (!first) return '';
    return generateTaskMessage(first.type, '{{first_name}}', {
      property: getTaskProperty(first),
      date: first.due_at ? formatDateTime(first.due_at) : undefined,
      title: first.title,
    });
  }, [tasks, tasksWithPhone]);

  const [phase, setPhase] = useState<BulkSmsPhase>('compose');
  const [template, setTemplate] = useState(defaultTemplate);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [campaignCreating, setCampaignCreating] = useState(false);
  const [error, setError] = useState('');

  // Compose phase: preview against first contact
  const previewName = getTaskContactName(tasksWithPhone[0] ?? tasks[0] ?? ({} as Task));
  const composePreview = template.replace(/\{\{first_name\}\}/g, previewName);

  // Sending phase: current task
  const currentTask = tasksWithPhone[currentIndex];
  const currentName = currentTask ? getTaskContactName(currentTask) : '';
  const currentPhone = currentTask ? getTaskContactPhone(currentTask) : '';
  const currentMessage = currentTask
    ? template.replace(/\{\{first_name\}\}/g, currentName)
    : '';

  const isDone = phase === 'sending' && currentIndex >= tasksWithPhone.length;

  // Start: create campaign for tracking, then enter sending phase
  const handleStart = useCallback(async () => {
    if (!template.trim()) { setError('Message template is required'); return; }
    if (tasksWithPhone.length === 0) { setError('None of the selected tasks have a contact with a phone number'); return; }
    setCampaignCreating(true);
    setError('');
    try {
      const campaign = await createCampaign({
        name: `Bulk SMS — ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        message_template: template.trim(),
        status: 'draft',
      });
      if (campaign) {
        const contacts = tasksWithPhone.map((t) => {
          const c = Array.isArray(t.contact) ? t.contact[0] : t.contact;
          return {
            id: c?.id ?? t.id,
            first_name: c?.first_name ?? '',
            phone: getTaskContactPhone(t),
          } as Parameters<typeof addRecipients>[1][number];
        });
        await addRecipients(campaign.id, contacts);
      }
    } catch {
      // Non-fatal: campaign tracking failed but we can still proceed with sending
    } finally {
      setCampaignCreating(false);
    }
    setCurrentIndex(0);
    setSentCount(0);
    setSkippedCount(0);
    setPhase('sending');
  }, [template, tasksWithPhone, createCampaign, addRecipients]);

  // Open the SMS app for the current contact, then advance
  const handleOpenSms = useCallback(() => {
    if (!currentPhone) return;
    const phone = currentPhone.replace(/[^\d+]/g, '');
    const body = encodeURIComponent(currentMessage);
    window.open(`sms:${phone}?body=${body}`, '_blank');
    setSentCount((n) => n + 1);
    setCurrentIndex((i) => i + 1);
  }, [currentPhone, currentMessage]);

  const handleSkip = useCallback(() => {
    setSkippedCount((n) => n + 1);
    setCurrentIndex((i) => i + 1);
  }, []);

  const handleFinish = useCallback(() => {
    onSent();
  }, [onSent]);

  // Progress bar width
  const progressPct = tasksWithPhone.length > 0
    ? Math.round((currentIndex / tasksWithPhone.length) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={isDone ? handleFinish : onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bulk SMS</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {phase === 'compose' ? (
                <>
                  <span className="font-medium text-gray-700">{tasksWithPhone.length}</span> of {tasks.length} contacts have a phone number
                  {tasks.length - tasksWithPhone.length > 0 && (
                    <span className="ml-1 text-amber-600">
                      ({tasks.length - tasksWithPhone.length} will be skipped — no phone)
                    </span>
                  )}
                </>
              ) : isDone ? (
                'All done'
              ) : (
                <>Sending {currentIndex + 1} of {tasksWithPhone.length}</>
              )}
            </p>
          </div>
          <button
            onClick={isDone ? handleFinish : onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">

          {/* ── COMPOSE PHASE ── */}
          {phase === 'compose' && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Message Template
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {'{{first_name}}'} is replaced per contact
                  </span>
                </label>
                <textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                />
              </div>

              {template && (
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="mb-1 text-xs font-medium text-gray-500">
                    Preview (as sent to {previewName})
                  </p>
                  <p className="text-sm text-gray-700">{composePreview}</p>
                </div>
              )}

              {/* Recipient list */}
              {tasksWithPhone.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2 space-y-1">
                  {tasksWithPhone.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs text-gray-600">
                      <span className="font-medium">{getTaskContactName(t)}</span>
                      <span className="text-gray-400">{getTaskContactPhone(t)}</span>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={campaignCreating || tasksWithPhone.length === 0 || !template.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {campaignCreating ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Preparing...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                      </svg>
                      Start Bulk SMS
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* ── SENDING PHASE — in progress ── */}
          {phase === 'sending' && !isDone && currentTask && (
            <>
              {/* Progress bar */}
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                  <span>Sending {currentIndex + 1} of {tasksWithPhone.length}</span>
                  <span>{sentCount} sent &middot; {skippedCount} skipped</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Current contact card */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">Next recipient</p>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-gray-900">{currentName}</p>
                    <p className="text-sm text-gray-500">{currentPhone}</p>
                  </div>
                  <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    {currentIndex + 1}/{tasksWithPhone.length}
                  </span>
                </div>
                <div className="mt-3 rounded-lg bg-white border border-gray-100 p-3">
                  <p className="text-xs font-medium text-gray-400 mb-1">Message</p>
                  <p className="text-sm text-gray-700">{currentMessage}</p>
                </div>
              </div>

              {/* Upcoming contacts */}
              {currentIndex + 1 < tasksWithPhone.length && (
                <p className="text-xs text-gray-400">
                  Up next: <span className="font-medium text-gray-600">
                    {getTaskContactName(tasksWithPhone[currentIndex + 1])}
                  </span>
                  {currentIndex + 2 < tasksWithPhone.length && (
                    <> and {tasksWithPhone.length - currentIndex - 2} more</>
                  )}
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={handleOpenSms}
                  className="ml-auto inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                  </svg>
                  Open SMS for {currentName}
                </button>
              </div>
            </>
          )}

          {/* ── SENDING PHASE — done ── */}
          {phase === 'sending' && isDone && (
            <>
              <div className="rounded-xl bg-green-50 p-5 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-green-900">All done!</p>
                <p className="mt-1 text-sm text-green-700">
                  {sentCount} SMS opened &middot; {skippedCount} skipped
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleFinish}
                  className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List View
// ---------------------------------------------------------------------------

function TaskListView({
  tasks,
  allCount,
  isLoading,
  expandedId,
  selectedIds,
  allSelected,
  someSelected,
  onToggleExpand,
  onComplete,
  onDelete,
  onToggleSelect,
  onSelectAll,
}: {
  tasks: Task[];
  allCount: number;
  isLoading: boolean;
  expandedId: string | null;
  selectedIds: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  onToggleExpand: (id: string) => void;
  onComplete: (e: React.MouseEvent, id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onToggleSelect: (e: React.MouseEvent, id: string) => void;
  onSelectAll: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="py-20 text-center text-sm text-gray-500">
          {allCount === 0
            ? 'No tasks yet. Create your first task to get started.'
            : 'No tasks match your filters.'}
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="pl-4 pr-2 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={onSelectAll}
                  className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                  title="Select all"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Due Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Contact</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Property</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                isExpanded={expandedId === task.id}
                isSelected={selectedIds.has(task.id)}
                onToggle={() => onToggleExpand(task.id)}
                onComplete={onComplete}
                onDelete={onDelete}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TaskRow({
  task,
  isExpanded,
  isSelected,
  onToggle,
  onComplete,
  onDelete,
  onToggleSelect,
}: {
  task: Task;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onComplete: (e: React.MouseEvent, id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onToggleSelect: (e: React.MouseEvent, id: string) => void;
}) {
  const overdue = isOverdue(task);

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${
          isSelected
            ? 'bg-primary-50'
            : overdue
              ? 'bg-red-50 hover:bg-red-100'
              : 'hover:bg-gray-50'
        }`}
        onClick={onToggle}
      >
        <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              const me = e as unknown as React.MouseEvent;
              onToggleSelect(me, task.id);
            }}
            onClick={(e) => onToggleSelect(e, task.id)}
            className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
          />
        </td>
        <td className="px-4 py-3">
          <span className="text-sm font-medium text-gray-900">{task.title}</span>
        </td>
        <td className="px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${TYPE_COLORS[task.type]}`}
            >
              {TYPE_ICONS[task.type]}
            </span>
            {TYPE_LABELS[task.type]}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[task.status]}`}
          >
            {STATUS_LABELS[task.status]}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[task.priority]}`}
          >
            {PRIORITY_LABELS[task.priority]}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(task.due_at)}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{contactName(task)}</td>
        <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">{propertyLabel(task)}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {task.status === 'pending' || task.status === 'overdue' ? (
              <button
                onClick={(e) => onComplete(e, task.id)}
                title="Complete task"
                className="rounded p-1 text-green-600 hover:bg-green-50 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
            ) : null}
            <button
              onClick={(e) => onDelete(e, task.id)}
              title="Delete task"
              className="rounded p-1 text-red-500 hover:bg-red-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {isExpanded && (
        <tr className={overdue ? 'bg-red-50/50' : 'bg-gray-50/50'}>
          <td colSpan={9} className="px-6 py-4">
            <div className="space-y-2 text-sm">
              {task.description && (
                <div>
                  <span className="font-medium text-gray-700">Description: </span>
                  <span className="text-gray-600">{task.description}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-500">
                {task.completed_at && (
                  <span>Completed: {formatDate(task.completed_at)}</span>
                )}
                {task.contact_id && (
                  <span>Contact: {contactName(task)}</span>
                )}
                {task.property_id && (
                  <span>Property: {propertyLabel(task)}</span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Calendar View
// ---------------------------------------------------------------------------

function TaskCalendarView({ tasks }: { tasks: Task[] }) {
  const [calendarSpan, setCalendarSpan] = useState<CalendarSpan>('month');
  const [refDate, setRefDate] = useState(() => new Date());

  const days = useMemo(() => {
    if (calendarSpan === 'week') {
      return getDaysForWeek(refDate);
    }
    return getDaysForMonth(refDate.getFullYear(), refDate.getMonth());
  }, [calendarSpan, refDate]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.due_at) continue;
      const d = new Date(task.due_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const existing = map.get(key) || [];
      existing.push(task);
      map.set(key, existing);
    }
    return map;
  }, [tasks]);

  const navigateBack = () => {
    const d = new Date(refDate);
    if (calendarSpan === 'week') {
      d.setDate(d.getDate() - 7);
    } else {
      d.setMonth(d.getMonth() - 1);
    }
    setRefDate(d);
  };

  const navigateForward = () => {
    const d = new Date(refDate);
    if (calendarSpan === 'week') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
    setRefDate(d);
  };

  const goToday = () => setRefDate(new Date());

  const headerLabel = calendarSpan === 'week'
    ? `Week of ${days[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : refDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  const today = new Date();

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Calendar header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={navigateBack}
            className="rounded p-1 hover:bg-gray-100 transition-colors"
          >
            <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[200px] text-center">
            {headerLabel}
          </span>
          <button
            onClick={navigateForward}
            className="rounded p-1 hover:bg-gray-100 transition-colors"
          >
            <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <button
            onClick={goToday}
            className="ml-2 rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Today
          </button>
        </div>

        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            onClick={() => setCalendarSpan('week')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              calendarSpan === 'week'
                ? 'bg-primary-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setCalendarSpan('month')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              calendarSpan === 'month'
                ? 'bg-primary-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-medium uppercase text-gray-500">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className={`grid grid-cols-7 ${calendarSpan === 'week' ? '' : 'auto-rows-[120px]'}`}>
        {days.map((day, idx) => {
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
          const dayTasks = tasksByDay.get(key) || [];
          const isCurrentMonth = day.getMonth() === refDate.getMonth();
          const isToday = isSameDay(day, today);

          return (
            <div
              key={idx}
              className={`border-b border-r border-gray-100 p-1.5 ${
                calendarSpan === 'week' ? 'min-h-[160px]' : ''
              } ${isCurrentMonth ? 'bg-white' : 'bg-gray-50/50'}`}
            >
              <div
                className={`mb-1 text-xs font-medium ${
                  isToday
                    ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-white'
                    : isCurrentMonth
                      ? 'text-gray-700'
                      : 'text-gray-400'
                }`}
              >
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, calendarSpan === 'week' ? 8 : 3).map((task) => (
                  <div
                    key={task.id}
                    title={`${task.title} (${TYPE_LABELS[task.type]})`}
                    className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${TYPE_COLORS[task.type]} ${
                      task.status === 'completed' ? 'opacity-50 line-through' : ''
                    }`}
                  >
                    {task.title}
                  </div>
                ))}
                {dayTasks.length > (calendarSpan === 'week' ? 8 : 3) && (
                  <div className="text-[10px] text-gray-400 pl-1">
                    +{dayTasks.length - (calendarSpan === 'week' ? 8 : 3)} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Task Modal
// ---------------------------------------------------------------------------

function CreateTaskModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'contact' | 'property'>) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TaskType>('task');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('09:00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    const dueAt = dueDate ? new Date(`${dueDate}T${dueTime}`).toISOString() : undefined;
    await onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      status: 'pending',
      priority,
      due_at: dueAt,
    });
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">New Task</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Enter task title..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
            />
          </div>

          {/* Type & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TaskType)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="task">Task</option>
                <option value="appointment">Appointment</option>
                <option value="follow_up">Follow Up</option>
                <option value="inspection_reminder">Inspection Reminder</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          {/* Due date & time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Time</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
