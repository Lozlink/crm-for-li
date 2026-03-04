import { create } from 'zustand';
import type { Task, TaskType, TaskStatus, TaskPriority, InspectionAttendee } from '@realestate-crm/types';
import { supabase, isDemoMode, generateUUID } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface TaskFilters {
  status?: TaskStatus;
  type?: TaskType;
  assigned_to?: string;
  from_date?: string;
  to_date?: string;
}

interface TaskState {
  tasks: Task[];
  todaysTasks: Task[];
  isLoading: boolean;
  error: string | null;

  fetchTasks: (filters?: TaskFilters) => Promise<void>;
  fetchTodaysTasks: () => Promise<void>;
  createTask: (task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'contact' | 'property'>) => Promise<Task | null>;
  completeTask: (id: string) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  createFollowUpTasks: (
    propertyId: string,
    propertyAddress: string,
    attendees: InspectionAttendee[]
  ) => Promise<void>;
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

const now = new Date();
const tomorrow = new Date(now);
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(9, 0, 0, 0);
const yesterday = new Date(now);
yesterday.setDate(yesterday.getDate() - 1);

const DEMO_TASKS: Task[] = [
  {
    id: 'demo-task-1',
    title: 'Follow up with Sarah Chen about 42 Harbour Street',
    type: 'follow_up',
    status: 'pending',
    priority: 'high',
    due_at: tomorrow.toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    contact_id: 'demo-contact-1',
    contact: { id: 'demo-contact-1', first_name: 'Sarah', last_name: 'Chen', email: 'sarah.chen@example.com', phone: '0412 345 678' } as Task['contact'],
    property: { id: 'demo-prop-1', address: '42 Harbour Street', suburb: 'Sydney' } as Task['property'],
  },
  {
    id: 'demo-task-2',
    title: 'Prepare CMA for 23 Victoria Avenue appraisal',
    type: 'task',
    status: 'pending',
    priority: 'normal',
    due_at: tomorrow.toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  },
  {
    id: 'demo-task-3',
    title: 'Call vendor re: 7 Ocean Road offer update',
    type: 'follow_up',
    status: 'overdue',
    priority: 'high',
    due_at: yesterday.toISOString(),
    created_at: yesterday.toISOString(),
    updated_at: yesterday.toISOString(),
    contact_id: 'demo-contact-2',
    contact: { id: 'demo-contact-2', first_name: 'James', last_name: 'Wilson', phone: '0423 456 789' } as Task['contact'],
    property: { id: 'demo-prop-2', address: '7 Ocean Road', suburb: 'Bondi Beach' } as Task['property'],
  },
  {
    id: 'demo-task-4',
    title: 'Schedule photographer for Crown Street listing',
    type: 'task',
    status: 'pending',
    priority: 'low',
    due_at: new Date(now.getTime() + 3 * 86400000).toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  },
  {
    id: 'demo-task-5',
    title: 'Send inspection feedback to attendees',
    type: 'follow_up',
    status: 'completed',
    priority: 'normal',
    due_at: yesterday.toISOString(),
    completed_at: yesterday.toISOString(),
    created_at: new Date(now.getTime() - 2 * 86400000).toISOString(),
    updated_at: yesterday.toISOString(),
  },
];

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: [],
  todaysTasks: [],
  isLoading: false,
  error: null,

  fetchTasks: async (filters) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) {
        set({ tasks: DEMO_TASKS, isLoading: false });
        return;
      }

      let query = supabase
        .from('tasks')
        .select('*, contact:contacts(id, first_name, last_name, email, phone), property:properties(id, address, suburb)')
        .order('due_at', { ascending: true, nullsFirst: false });

      if (teamId) query = query.eq('team_id', teamId);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.type) query = query.eq('type', filters.type);
      if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to);
      if (filters?.from_date) query = query.gte('due_at', filters.from_date);
      if (filters?.to_date) query = query.lte('due_at', filters.to_date);

      const { data, error } = await query;
      if (error) throw error;
      set({ tasks: (data as Task[]) || [], isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch tasks';
      set({ error: message, isLoading: false });
    }
  },

  fetchTodaysTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId, userId } = getTeamContext();
      if (isDemo) {
        set({
          todaysTasks: DEMO_TASKS.filter((t) => t.status === 'pending' || t.status === 'overdue'),
          isLoading: false,
        });
        return;
      }

      const now = new Date();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

      let query = supabase
        .from('tasks')
        .select('*, contact:contacts(id, first_name, last_name, email, phone), property:properties(id, address, suburb)')
        .in('status', ['pending', 'overdue'])
        .lte('due_at', endOfDay)
        .order('due_at', { ascending: true });

      if (teamId) query = query.eq('team_id', teamId);
      if (userId) query = query.eq('assigned_to', userId);

      const { data, error } = await query;
      if (error) throw error;
      set({ todaysTasks: (data as Task[]) || [], isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch today\'s tasks';
      set({ error: message, isLoading: false });
    }
  },

  createTask: async (task) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();

      if (isDemo) {
        const newTask: Task = {
          ...task,
          id: generateUUID(),
          team_id: teamId || undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set((state) => ({ tasks: [newTask, ...state.tasks] }));
        return newTask;
      }

      const insertData: Record<string, unknown> = { ...task };
      if (teamId) insertData.team_id = teamId;
      if (!insertData.assigned_to && userId) insertData.assigned_to = userId;

      const { data, error } = await supabase
        .from('tasks')
        .insert(insertData)
        .select('*, contact:contacts(id, first_name, last_name, email, phone), property:properties(id, address, suburb)')
        .single();

      if (error) throw error;
      const newTask = data as Task;
      set((state) => ({ tasks: [newTask, ...state.tasks] }));
      return newTask;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create task';
      set({ error: message });
      return null;
    }
  },

  completeTask: async (id) => {
    try {
      const { isDemo } = getTeamContext();
      const updates = { status: 'completed' as TaskStatus, completed_at: new Date().toISOString() };

      if (isDemo) {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
          todaysTasks: state.todaysTasks.filter((t) => t.id !== id),
        }));
        return;
      }

      const { error } = await supabase.from('tasks').update(updates).eq('id', id);
      if (error) throw error;

      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        todaysTasks: state.todaysTasks.filter((t) => t.id !== id),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to complete task';
      set({ error: message });
    }
  },

  updateTask: async (id, updates) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        }));
        return;
      }

      const { error } = await supabase.from('tasks').update(updates).eq('id', id);
      if (error) throw error;

      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update task';
      set({ error: message });
    }
  },

  deleteTask: async (id) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== id),
          todaysTasks: state.todaysTasks.filter((t) => t.id !== id),
        }));
        return;
      }

      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;

      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== id),
        todaysTasks: state.todaysTasks.filter((t) => t.id !== id),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete task';
      set({ error: message });
    }
  },

  createFollowUpTasks: async (propertyId, propertyAddress, attendees) => {
    const { teamId, userId } = getTeamContext();
    const hotAttendees = attendees.filter((a) => a.interest_level === 'hot');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    for (const attendee of hotAttendees) {
      const name = [attendee.first_name, attendee.last_name].filter(Boolean).join(' ');
      await get().createTask({
        title: `Follow up with ${name} from inspection at ${propertyAddress}`,
        type: 'follow_up',
        status: 'pending',
        priority: 'high',
        due_at: tomorrow.toISOString(),
        assigned_to: userId || undefined,
        contact_id: attendee.contact_id || undefined,
        property_id: propertyId,
        team_id: teamId || undefined,
      });
    }
  },
}));
