'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTaskStore } from '@realestate-crm/hooks';
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

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const filtered = useMemo(() => {
    let result = [...tasks];
    if (statusFilter !== 'all') result = result.filter((t) => t.status === statusFilter);
    if (typeFilter !== 'all') result = result.filter((t) => t.type === typeFilter);
    if (priorityFilter !== 'all') result = result.filter((t) => t.priority === priorityFilter);
    return result;
  }, [tasks, statusFilter, typeFilter, priorityFilter]);

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

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} of {tasks.length} tasks
          </p>
        </div>
        <div className="flex items-center gap-3">
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
          onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
          onComplete={handleComplete}
          onDelete={handleDelete}
        />
      ) : (
        <TaskCalendarView tasks={filtered} />
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
// List View
// ---------------------------------------------------------------------------

function TaskListView({
  tasks,
  allCount,
  isLoading,
  expandedId,
  onToggleExpand,
  onComplete,
  onDelete,
}: {
  tasks: Task[];
  allCount: number;
  isLoading: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onComplete: (e: React.MouseEvent, id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
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
                onToggle={() => onToggleExpand(task.id)}
                onComplete={onComplete}
                onDelete={onDelete}
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
  onToggle,
  onComplete,
  onDelete,
}: {
  task: Task;
  isExpanded: boolean;
  onToggle: () => void;
  onComplete: (e: React.MouseEvent, id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}) {
  const overdue = isOverdue(task);

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${
          overdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'
        }`}
        onClick={onToggle}
      >
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
          <td colSpan={8} className="px-6 py-4">
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
