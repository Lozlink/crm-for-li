import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, FlatList, ScrollView } from 'react-native';
import {
  FAB,
  useTheme,
  Text,
  Chip,
  ActivityIndicator,
  Surface,
  IconButton,
  Dialog,
  Portal,
  Button,
  TextInput,
  SegmentedButtons,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useTaskStore, useAuthStore } from '@realestate-crm/hooks';
import type { Task, TaskType, TaskStatus, TaskPriority } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type StatusFilter = 'outstanding' | 'completed';

const TYPE_ICONS: Record<TaskType, string> = {
  task: 'checkbox-marked-outline',
  appointment: 'calendar-clock',
  follow_up: 'phone-return-in-talk',
  inspection_reminder: 'home-search',
};

const TYPE_LABELS: Record<TaskType, string> = {
  task: 'Task',
  appointment: 'Appointment',
  follow_up: 'Follow Up',
  inspection_reminder: 'Inspection',
};

const PRIORITY_COLORS: Record<TaskPriority, string | null> = {
  high: '#dc2626',
  normal: null,
  low: '#9ca3af',
};

const TASK_TYPES: { label: string; value: TaskType }[] = [
  { label: 'Task', value: 'task' },
  { label: 'Appointment', value: 'appointment' },
  { label: 'Follow Up', value: 'follow_up' },
  { label: 'Inspection', value: 'inspection_reminder' },
];

const PRIORITY_OPTIONS: { label: string; value: TaskPriority }[] = [
  { label: 'Low', value: 'low' },
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
];

function formatDueDate(dueAt: string | undefined): string {
  if (!dueAt) return '';
  const date = new Date(dueAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dueDay.getTime() === today.getTime()) {
    return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (dueDay.getTime() === tomorrow.getTime()) {
    return `Tomorrow, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(dueAt: string | undefined, status: TaskStatus): boolean {
  if (!dueAt || status === 'completed') return false;
  return new Date(dueAt) < new Date();
}

function getContactDisplayName(contact: Task['contact']): string | null {
  if (!contact) return null;
  const parts = [contact.first_name, contact.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

export default function TasksScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const tasks = useTaskStore(state => state.tasks);
  const isLoading = useTaskStore(state => state.isLoading);
  const fetchTasks = useTaskStore(state => state.fetchTasks);
  const completeTask = useTaskStore(state => state.completeTask);
  const createTask = useTaskStore(state => state.createTask);

  const currentUserId = useAuthStore(state => state.user?.id);

  const [refreshing, setRefreshing] = useState(false);
  const [myTasksOnly, setMyTasksOnly] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('outstanding');

  // Create dialog state
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<TaskType>('task');
  const [newPriority, setNewPriority] = useState<TaskPriority>('normal');
  const [newDueDate, setNewDueDate] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchTasks();
    }, [fetchTasks])
  );

  const filteredAndSortedTasks = useMemo(() => {
    let result = tasks;

    // Filter by assignment
    if (myTasksOnly && currentUserId) {
      result = result.filter(t => t.assigned_to === currentUserId);
    }

    // Filter by status
    if (statusFilter === 'outstanding') {
      result = result.filter(t => t.status === 'pending' || t.status === 'overdue');
    } else {
      result = result.filter(t => t.status === 'completed');
    }

    // Sort by due date ascending, nulls last
    result = [...result].sort((a, b) => {
      if (!a.due_at && !b.due_at) return 0;
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });

    return result;
  }, [tasks, myTasksOnly, currentUserId, statusFilter]);

  const overdueCount = useMemo(() => {
    let source = tasks;
    if (myTasksOnly && currentUserId) {
      source = source.filter(t => t.assigned_to === currentUserId);
    }
    return source.filter(t => t.status === 'overdue' || isOverdue(t.due_at, t.status)).length;
  }, [tasks, myTasksOnly, currentUserId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  }, [fetchTasks]);

  const handleComplete = useCallback(async (id: string) => {
    await completeTask(id);
  }, [completeTask]);

  const handleOpenCreate = () => {
    setNewTitle('');
    setNewType('task');
    setNewPriority('normal');
    setNewDueDate('');
    setCreateDialogVisible(true);
  };

  const handleCreateTask = async () => {
    if (!newTitle.trim()) return;
    setIsCreating(true);

    const taskData: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'contact' | 'property'> = {
      title: newTitle.trim(),
      type: newType,
      status: 'pending',
      priority: newPriority,
      assigned_to: currentUserId || undefined,
    };

    if (newDueDate.trim()) {
      const parsed = new Date(newDueDate.trim());
      if (!isNaN(parsed.getTime())) {
        taskData.due_at = parsed.toISOString();
      }
    }

    await createTask(taskData);
    setIsCreating(false);
    setCreateDialogVisible(false);
    fetchTasks();
  };

  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      {/* My Tasks / All Tasks toggle */}
      <SegmentedButtons
        value={myTasksOnly ? 'mine' : 'all'}
        onValueChange={(val) => setMyTasksOnly(val === 'mine')}
        buttons={[
          { value: 'mine', label: 'My Tasks' },
          { value: 'all', label: 'All Tasks' },
        ]}
        style={styles.segmentedButtons}
      />

      {/* Status filter chips */}
      <View style={styles.filterRow}>
        <Chip
          selected={statusFilter === 'outstanding'}
          onPress={() => setStatusFilter('outstanding')}
          style={styles.filterChip}
          compact
        >
          Outstanding{overdueCount > 0 ? ` (${overdueCount} overdue)` : ''}
        </Chip>
        <Chip
          selected={statusFilter === 'completed'}
          onPress={() => setStatusFilter('completed')}
          style={styles.filterChip}
          compact
        >
          Completed
        </Chip>
      </View>
    </View>
  );

  const renderItem = useCallback(({ item }: { item: Task }) => {
    const overdue = item.status === 'overdue' || isOverdue(item.due_at, item.status);
    const contactName = getContactDisplayName(item.contact);
    const propertyAddress = item.property?.address || null;
    const priorityColor = PRIORITY_COLORS[item.priority];
    const isPending = item.status !== 'completed';

    return (
      <Surface style={styles.card} elevation={1}>
        <View style={styles.cardTouchable}>
          <View style={styles.cardContent}>
            {/* Top row: type icon + title + complete button */}
            <View style={styles.cardTopRow}>
              <Surface
                style={[
                  styles.typeIconContainer,
                  { backgroundColor: theme.colors.primaryContainer },
                ]}
                elevation={0}
              >
                <Icon
                  name={TYPE_ICONS[item.type]}
                  size={22}
                  color={theme.colors.onPrimaryContainer}
                />
              </Surface>
              <View style={styles.titleContainer}>
                <Text
                  variant="titleMedium"
                  numberOfLines={2}
                  style={[
                    styles.titleText,
                    item.status === 'completed' && styles.completedText,
                  ]}
                >
                  {item.title}
                </Text>
              </View>
              {isPending && (
                <IconButton
                  icon="check-circle-outline"
                  iconColor="#16a34a"
                  size={24}
                  onPress={() => handleComplete(item.id)}
                  accessibilityLabel="Complete task"
                />
              )}
            </View>

            {/* Badges row: type label + priority + due date */}
            <View style={styles.badgeRow}>
              <Chip
                compact
                style={{ backgroundColor: theme.colors.secondaryContainer }}
                textStyle={{
                  color: theme.colors.onSecondaryContainer,
                  fontSize: 11,
                }}
              >
                {TYPE_LABELS[item.type]}
              </Chip>
              {priorityColor && (
                <Chip
                  compact
                  style={{ backgroundColor: priorityColor }}
                  textStyle={{ color: '#fff', fontSize: 11 }}
                >
                  {item.priority === 'high' ? 'High' : 'Low'}
                </Chip>
              )}
              {item.due_at && (
                <Text
                  variant="bodySmall"
                  style={[
                    { marginLeft: 'auto' },
                    overdue
                      ? { color: '#dc2626', fontWeight: '600' }
                      : { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {overdue ? 'Overdue: ' : ''}{formatDueDate(item.due_at)}
                </Text>
              )}
            </View>

            {/* Contact / Property row */}
            {(contactName || propertyAddress) && (
              <View style={styles.metaRow}>
                {contactName && (
                  <View style={styles.metaItem}>
                    <Icon name="account" size={14} color={theme.colors.onSurfaceVariant} />
                    <Text
                      variant="bodySmall"
                      numberOfLines={1}
                      style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}
                    >
                      {contactName}
                    </Text>
                  </View>
                )}
                {propertyAddress && (
                  <View style={styles.metaItem}>
                    <Icon name="home" size={14} color={theme.colors.onSurfaceVariant} />
                    <Text
                      variant="bodySmall"
                      numberOfLines={1}
                      style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}
                    >
                      {propertyAddress}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Surface>
    );
  }, [theme.colors, handleComplete]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="checkbox-marked-circle-outline" size={48} color={theme.colors.onSurfaceVariant} />
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
        No tasks
      </Text>
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
      >
        {statusFilter === 'outstanding'
          ? 'All caught up! Tap + to add a new task.'
          : 'No completed tasks yet.'}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={filteredAndSortedTasks}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderFilters}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={
            filteredAndSortedTasks.length === 0 ? styles.emptyList : styles.list
          }
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary, bottom: insets.bottom + 24 }]}
        color={theme.colors.onPrimary}
        onPress={handleOpenCreate}
      />

      {/* Create Task Dialog */}
      <Portal>
        <Dialog
          visible={createDialogVisible}
          onDismiss={() => setCreateDialogVisible(false)}
        >
          <Dialog.Title>New Task</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView>
              <View style={styles.dialogContent}>
                <TextInput
                  label="Title *"
                  value={newTitle}
                  onChangeText={setNewTitle}
                  mode="outlined"
                  autoFocus
                />

                <Text variant="labelMedium" style={styles.fieldLabel}>
                  Type
                </Text>
                <View style={styles.filterRow}>
                  {TASK_TYPES.map(opt => (
                    <Chip
                      key={opt.value}
                      selected={newType === opt.value}
                      onPress={() => setNewType(opt.value)}
                      compact
                      style={styles.filterChip}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </View>

                <Text variant="labelMedium" style={styles.fieldLabel}>
                  Priority
                </Text>
                <View style={styles.filterRow}>
                  {PRIORITY_OPTIONS.map(opt => (
                    <Chip
                      key={opt.value}
                      selected={newPriority === opt.value}
                      onPress={() => setNewPriority(opt.value)}
                      compact
                      style={styles.filterChip}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </View>

                <TextInput
                  label="Due Date (YYYY-MM-DD)"
                  value={newDueDate}
                  onChangeText={setNewDueDate}
                  mode="outlined"
                  placeholder="e.g. 2026-03-01"
                />
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setCreateDialogVisible(false)}>Cancel</Button>
            <Button
              onPress={handleCreateTask}
              loading={isCreating}
              disabled={!newTitle.trim() || isCreating}
            >
              Create
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filtersContainer: {
    marginBottom: 8,
    gap: 8,
  },
  segmentedButtons: {
    marginBottom: 4,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    marginBottom: 0,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
  },
  cardTouchable: {
    padding: 16,
  },
  cardContent: {
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
  },
  titleText: {
    fontWeight: '600',
  },
  completedText: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
  },
  dialogScrollArea: {
    paddingHorizontal: 0,
  },
  dialogContent: {
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  fieldLabel: {
    marginTop: 4,
  },
});
