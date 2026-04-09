import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, FlatList, ScrollView, Linking, Platform, Pressable } from 'react-native';
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
  Checkbox,
  Modal,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useTaskStore, useAuthStore, useCRMStore, usePropertyStore } from '@realestate-crm/hooks';
import type { Task, TaskType, TaskStatus, TaskPriority, Contact, Property, Activity } from '@realestate-crm/types';
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

function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

function handleTaskEmail(task: Task) {
  const contact = task.contact;
  if (!contact?.email) return;
  const name = getContactDisplayName(contact) || 'there';
  const subject = encodeURIComponent(task.title);
  const body = encodeURIComponent(generateTaskMessage(task.type, name, {
    property: task.property?.address,
    date: task.due_at ? formatDueDate(task.due_at) : undefined,
    title: task.title,
  }));
  Linking.openURL(`mailto:${encodeURIComponent(contact.email)}?subject=${subject}&body=${body}`).catch(() => {});
}

function handleTaskSMS(task: Task, addActivity?: (activity: Omit<Activity, 'id' | 'created_at'>) => void) {
  const contact = task.contact;
  if (!contact?.phone) return;
  const phone = sanitizePhone(contact.phone);
  const name = getContactDisplayName(contact) || 'there';
  const message = generateTaskMessage(task.type, name, {
    property: task.property?.address,
    date: task.due_at ? formatDueDate(task.due_at) : undefined,
    title: task.title,
  });
  const body = encodeURIComponent(message);
  const separator = Platform.OS === 'ios' ? '&' : '?';
  Linking.openURL(`sms:${phone}${separator}body=${body}`).catch(() => {});
  if (addActivity && contact.id) {
    const preview = message.length > 200 ? `${message.slice(0, 200)}…` : message;
    addActivity({
      contact_id: contact.id,
      type: 'sms',
      content: `SMS initiated: ${preview}`,
    })?.catch?.((e: unknown) => console.warn('SMS activity log failed:', e));
  }
}

function handleTaskCall(task: Task) {
  const contact = task.contact;
  if (!contact?.phone) return;
  Linking.openURL(`tel:${sanitizePhone(contact.phone)}`).catch(() => {});
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
  const allContacts = useCRMStore(state => state.contacts);
  const fetchContacts = useCRMStore(state => state.fetchContacts);
  const addActivity = useCRMStore(state => state.addActivity);
  const allProperties = usePropertyStore(state => state.properties);
  const fetchProperties = usePropertyStore(state => state.fetchProperties);

  const [refreshing, setRefreshing] = useState(false);
  const [myTasksOnly, setMyTasksOnly] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('outstanding');

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Bulk SMS state
  const [bulkSmsModalVisible, setBulkSmsModalVisible] = useState(false);
  const [bulkSmsMessage, setBulkSmsMessage] = useState('');
  const [bulkSmsCurrentIndex, setBulkSmsCurrentIndex] = useState(0);
  const [bulkSmsSentCount, setBulkSmsSentCount] = useState(0);
  const [bulkSmsSkippedCount, setBulkSmsSkippedCount] = useState(0);
  const [bulkSmsPhase, setBulkSmsPhase] = useState<'compose' | 'sending' | 'done'>('compose');

  // Create dialog state
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState<TaskType>('task');
  const [newPriority, setNewPriority] = useState<TaskPriority>('normal');
  const [newDueDate, setNewDueDate] = useState('');
  const [newContactId, setNewContactId] = useState<string | undefined>(undefined);
  const [newPropertyId, setNewPropertyId] = useState<string | undefined>(undefined);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [propertySearchQuery, setPropertySearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Filtered contacts/properties for the pickers
  const filteredPickerContacts = useMemo(() => {
    if (!contactSearchQuery) return allContacts.filter(c => c.first_name).slice(0, 20);
    const q = contactSearchQuery.toLowerCase();
    return allContacts
      .filter(c => c.first_name)
      .filter(c => {
        const name = `${c.first_name} ${c.last_name || ''}`.toLowerCase();
        return name.includes(q);
      })
      .slice(0, 20);
  }, [allContacts, contactSearchQuery]);

  const filteredPickerProperties = useMemo(() => {
    if (!propertySearchQuery) return allProperties.slice(0, 20);
    const q = propertySearchQuery.toLowerCase();
    return allProperties
      .filter(p => (p.address || '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [allProperties, propertySearchQuery]);

  const selectedContact = useMemo(
    () => newContactId ? allContacts.find(c => c.id === newContactId) : undefined,
    [allContacts, newContactId],
  );

  const selectedProperty = useMemo(
    () => newPropertyId ? allProperties.find(p => p.id === newPropertyId) : undefined,
    [allProperties, newPropertyId],
  );

  useFocusEffect(
    useCallback(() => {
      fetchTasks();
      fetchContacts();
      fetchProperties();
    }, [fetchTasks, fetchContacts, fetchProperties])
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
    setNewDescription('');
    setNewType('task');
    setNewPriority('normal');
    setNewDueDate('');
    setNewContactId(undefined);
    setNewPropertyId(undefined);
    setContactSearchQuery('');
    setPropertySearchQuery('');
    setCreateDialogVisible(true);
  };

  const handleCreateTask = async () => {
    if (!newTitle.trim()) return;
    setIsCreating(true);

    const taskData: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'contact' | 'property'> = {
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      type: newType,
      status: 'pending',
      priority: newPriority,
      assigned_to: currentUserId || undefined,
      contact_id: newContactId,
      property_id: newPropertyId,
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

  // ── Multi-select handlers ──────────────────────────────────────────
  const handleLongPress = useCallback((id: string) => {
    setSelectMode(true);
    setSelectedTaskIds(prev => new Set([...prev, id]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedTaskIds(new Set(filteredAndSortedTasks.map(t => t.id)));
  }, [filteredAndSortedTasks]);

  const exitSelectMode = useCallback(() => {
    setSelectedTaskIds(new Set());
    setSelectMode(false);
  }, []);

  // ── Bulk SMS helpers ─────────────────────────────────────────────
  const bulkSmsEligibleTasks = useMemo(() => {
    return filteredAndSortedTasks.filter(
      t => selectedTaskIds.has(t.id) && t.contact?.phone,
    );
  }, [filteredAndSortedTasks, selectedTaskIds]);

  const bulkSmsSkippedTasks = useMemo(() => {
    return filteredAndSortedTasks.filter(
      t => selectedTaskIds.has(t.id) && !t.contact?.phone,
    );
  }, [filteredAndSortedTasks, selectedTaskIds]);

  const handleOpenBulkSms = useCallback(() => {
    if (bulkSmsEligibleTasks.length === 0) return;
    // Generate a default message from the first eligible task's type
    const firstTask = bulkSmsEligibleTasks[0];
    const defaultMessage = generateTaskMessage(
      firstTask.type,
      '{name}',
      {
        property: firstTask.property?.address,
        date: firstTask.due_at ? formatDueDate(firstTask.due_at) : undefined,
        title: firstTask.title,
      },
    );
    setBulkSmsMessage(defaultMessage);
    setBulkSmsPhase('compose');
    setBulkSmsCurrentIndex(0);
    setBulkSmsSentCount(0);
    setBulkSmsSkippedCount(0);
    setBulkSmsModalVisible(true);
  }, [bulkSmsEligibleTasks]);

  const handleStartBulkSend = useCallback(() => {
    setBulkSmsPhase('sending');
    setBulkSmsCurrentIndex(0);
    setBulkSmsSentCount(0);
    setBulkSmsSkippedCount(0);
  }, []);

  const currentBulkTask = bulkSmsEligibleTasks[bulkSmsCurrentIndex] as Task | undefined;

  const handleSendCurrentSms = useCallback(() => {
    if (!currentBulkTask?.contact?.phone) return;
    const phone = sanitizePhone(currentBulkTask.contact.phone);
    const contactName = getContactDisplayName(currentBulkTask.contact) || 'there';
    const personalizedMessage = bulkSmsMessage.replace(/\{name\}/g, contactName);
    const body = encodeURIComponent(personalizedMessage);
    const separator = Platform.OS === 'ios' ? '&' : '?';
    Linking.openURL(`sms:${phone}${separator}body=${body}`).catch(() => {});
    if (currentBulkTask.contact.id) {
      const preview = personalizedMessage.length > 200 ? `${personalizedMessage.slice(0, 200)}…` : personalizedMessage;
      addActivity({
        contact_id: currentBulkTask.contact.id,
        type: 'sms',
        content: `SMS initiated: ${preview}`,
      }).catch((e) => console.warn('SMS activity log failed:', e));
    }
    setBulkSmsSentCount(prev => prev + 1);
    const nextIdx = bulkSmsCurrentIndex + 1;
    if (nextIdx >= bulkSmsEligibleTasks.length) {
      setBulkSmsPhase('done');
    } else {
      setBulkSmsCurrentIndex(nextIdx);
    }
  }, [currentBulkTask, bulkSmsMessage, bulkSmsCurrentIndex, bulkSmsEligibleTasks.length, addActivity]);

  const handleSkipCurrentSms = useCallback(() => {
    setBulkSmsSkippedCount(prev => prev + 1);
    const nextIdx = bulkSmsCurrentIndex + 1;
    if (nextIdx >= bulkSmsEligibleTasks.length) {
      setBulkSmsPhase('done');
    } else {
      setBulkSmsCurrentIndex(nextIdx);
    }
  }, [bulkSmsCurrentIndex, bulkSmsEligibleTasks.length]);

  const handleStopBulkSend = useCallback(() => {
    setBulkSmsPhase('done');
  }, []);

  const handleCloseBulkSms = useCallback(() => {
    setBulkSmsModalVisible(false);
    exitSelectMode();
  }, [exitSelectMode]);

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
    const isSelected = selectedTaskIds.has(item.id);

    const handlePress = () => {
      if (selectMode) {
        toggleSelect(item.id);
      }
    };

    const cardContent = (
      <View style={styles.cardContent}>
        {/* Top row: type icon + title + complete button */}
        <View style={styles.cardTopRow}>
          {selectMode && (
            <Checkbox
              status={isSelected ? 'checked' : 'unchecked'}
              onPress={() => toggleSelect(item.id)}
            />
          )}
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
          {isPending && !selectMode && (
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

        {/* Action buttons for tasks with linked contacts */}
        {isPending && !selectMode && item.contact && (item.contact.email || item.contact.phone) && (
          <View style={styles.actionRow}>
            {item.contact.email && (
              <IconButton
                icon="email-outline"
                size={20}
                iconColor={theme.colors.primary}
                style={styles.actionButton}
                onPress={() => handleTaskEmail(item)}
                accessibilityLabel="Send email"
              />
            )}
            {item.contact.phone && (
              <IconButton
                icon="message-text-outline"
                size={20}
                iconColor={theme.colors.primary}
                style={styles.actionButton}
                onPress={() => handleTaskSMS(item, addActivity)}
                accessibilityLabel="Send SMS"
              />
            )}
            {item.contact.phone && (
              <IconButton
                icon="phone-outline"
                size={20}
                iconColor={theme.colors.primary}
                style={styles.actionButton}
                onPress={() => handleTaskCall(item)}
                accessibilityLabel="Call contact"
              />
            )}
          </View>
        )}
      </View>
    );

    return (
      <Pressable
        onPress={handlePress}
        onLongPress={() => handleLongPress(item.id)}
        delayLongPress={400}
      >
        <Surface
          style={[
            styles.card,
            isSelected && { backgroundColor: theme.colors.primaryContainer },
          ]}
          elevation={1}
        >
          <View style={styles.cardTouchable}>
            {cardContent}
          </View>
        </Surface>
      </Pressable>
    );
  }, [theme.colors, handleComplete, selectMode, selectedTaskIds, toggleSelect, handleLongPress]);

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
      {/* Select mode bar */}
      {selectMode && (
        <View style={[styles.selectBar, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text variant="labelLarge" style={{ color: theme.colors.onPrimaryContainer, flex: 1 }}>
            {selectedTaskIds.size} selected
          </Text>
          <Button compact onPress={handleSelectAll} textColor={theme.colors.onPrimaryContainer}>
            Select All
          </Button>
          {selectedTaskIds.size >= 2 && (
            <Button
              compact
              icon="message-text-outline"
              onPress={handleOpenBulkSms}
              textColor={theme.colors.primary}
            >
              Bulk SMS
            </Button>
          )}
          <Button compact onPress={exitSelectMode} textColor={theme.colors.onPrimaryContainer}>
            Clear
          </Button>
        </View>
      )}

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
          style={styles.createDialog}
        >
          <Dialog.Title>New Task</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.dialogContent}>
                <TextInput
                  label="Title *"
                  value={newTitle}
                  onChangeText={setNewTitle}
                  mode="outlined"
                  autoFocus
                />

                <TextInput
                  label="Description"
                  value={newDescription}
                  onChangeText={setNewDescription}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
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

                {/* Contact Picker */}
                <Text variant="labelMedium" style={styles.fieldLabel}>
                  Link Contact
                </Text>
                {selectedContact ? (
                  <Chip
                    icon="account"
                    onClose={() => setNewContactId(undefined)}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {[selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ')}
                  </Chip>
                ) : (
                  <View>
                    <TextInput
                      label="Search contacts..."
                      value={contactSearchQuery}
                      onChangeText={setContactSearchQuery}
                      mode="outlined"
                      dense
                      left={<TextInput.Icon icon="magnify" />}
                    />
                    {contactSearchQuery.length > 0 && filteredPickerContacts.length > 0 && (
                      <Surface style={styles.pickerList} elevation={2}>
                        <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                          {filteredPickerContacts.map(c => (
                            <Pressable
                              key={c.id}
                              style={styles.pickerItem}
                              onPress={() => {
                                setNewContactId(c.id);
                                setContactSearchQuery('');
                              }}
                            >
                              <Icon name="account" size={16} color={theme.colors.onSurfaceVariant} />
                              <Text variant="bodyMedium" style={{ marginLeft: 8 }}>
                                {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                              </Text>
                              {c.phone && (
                                <Text variant="bodySmall" style={{ marginLeft: 'auto', color: theme.colors.onSurfaceVariant }}>
                                  {c.phone}
                                </Text>
                              )}
                            </Pressable>
                          ))}
                        </ScrollView>
                      </Surface>
                    )}
                  </View>
                )}

                {/* Property Picker */}
                <Text variant="labelMedium" style={styles.fieldLabel}>
                  Link Property
                </Text>
                {selectedProperty ? (
                  <Chip
                    icon="home"
                    onClose={() => setNewPropertyId(undefined)}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {selectedProperty.address}
                  </Chip>
                ) : (
                  <View>
                    <TextInput
                      label="Search properties..."
                      value={propertySearchQuery}
                      onChangeText={setPropertySearchQuery}
                      mode="outlined"
                      dense
                      left={<TextInput.Icon icon="magnify" />}
                    />
                    {propertySearchQuery.length > 0 && filteredPickerProperties.length > 0 && (
                      <Surface style={styles.pickerList} elevation={2}>
                        <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                          {filteredPickerProperties.map(p => (
                            <Pressable
                              key={p.id}
                              style={styles.pickerItem}
                              onPress={() => {
                                setNewPropertyId(p.id);
                                setPropertySearchQuery('');
                              }}
                            >
                              <Icon name="home" size={16} color={theme.colors.onSurfaceVariant} />
                              <Text variant="bodyMedium" style={{ marginLeft: 8 }} numberOfLines={1}>
                                {[p.address, p.suburb].filter(Boolean).join(', ')}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </Surface>
                    )}
                  </View>
                )}
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

        {/* Bulk SMS Modal */}
        <Modal
          visible={bulkSmsModalVisible}
          onDismiss={handleCloseBulkSms}
          contentContainerStyle={[
            styles.bulkSmsModal,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          {bulkSmsPhase === 'compose' && (
            <View style={styles.bulkSmsContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Icon name="message-text-outline" size={24} color={theme.colors.primary} />
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>Bulk SMS</Text>
              </View>

              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                Will send to {bulkSmsEligibleTasks.length} contact{bulkSmsEligibleTasks.length !== 1 ? 's' : ''}
                {bulkSmsSkippedTasks.length > 0
                  ? ` (${bulkSmsSkippedTasks.length} skipped -- no phone)`
                  : ''}
              </Text>

              <Text variant="labelMedium" style={{ marginBottom: 4, color: theme.colors.onSurfaceVariant }}>
                Message template (use {'{name}'} for contact name)
              </Text>
              <TextInput
                value={bulkSmsMessage}
                onChangeText={setBulkSmsMessage}
                mode="outlined"
                multiline
                numberOfLines={4}
                style={{ marginBottom: 16 }}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                <Button onPress={handleCloseBulkSms}>Cancel</Button>
                <Button
                  mode="contained"
                  icon="send"
                  onPress={handleStartBulkSend}
                  disabled={bulkSmsEligibleTasks.length === 0 || !bulkSmsMessage.trim()}
                >
                  Start Sending
                </Button>
              </View>
            </View>
          )}

          {bulkSmsPhase === 'sending' && currentBulkTask && (
            <View style={styles.bulkSmsContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Icon name="message-text-outline" size={24} color={theme.colors.primary} />
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                  Sending {bulkSmsCurrentIndex + 1} of {bulkSmsEligibleTasks.length}
                </Text>
              </View>

              <Surface style={[styles.bulkSmsRecipient, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                <Icon name="account" size={18} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodyMedium" style={{ fontWeight: '600', marginLeft: 8, flex: 1 }}>
                  {getContactDisplayName(currentBulkTask.contact) || 'Unknown'}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {currentBulkTask.contact?.phone}
                </Text>
              </Surface>

              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, marginBottom: 16 }}>
                Tapping "Send" will open the native SMS app for this contact.
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                <Button onPress={handleStopBulkSend} textColor={theme.colors.error}>
                  Stop
                </Button>
                <Button onPress={handleSkipCurrentSms}>
                  Skip
                </Button>
                <Button mode="contained" icon="message-text" onPress={handleSendCurrentSms}>
                  Send
                </Button>
              </View>
            </View>
          )}

          {bulkSmsPhase === 'done' && (
            <View style={styles.bulkSmsContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Icon name="check-circle" size={24} color="#16a34a" />
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>Bulk SMS Complete</Text>
              </View>

              <View style={{ gap: 4, marginBottom: 16 }}>
                <Text variant="bodyMedium">
                  {bulkSmsSentCount} sent, {bulkSmsSkippedCount} skipped
                </Text>
                {bulkSmsSkippedTasks.length > 0 && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {bulkSmsSkippedTasks.length} had no phone number
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Button mode="contained" onPress={handleCloseBulkSms}>
                  Done
                </Button>
              </View>
            </View>
          )}
        </Modal>
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginLeft: -8,
  },
  actionButton: {
    margin: 0,
  },
  fab: {
    position: 'absolute',
    right: 16,
  },
  createDialog: {
    maxHeight: '85%',
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
  pickerList: {
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  pickerScroll: {
    maxHeight: 160,
  },
  pickerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  bulkSmsModal: {
    margin: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  bulkSmsContent: {
    padding: 20,
  },
  bulkSmsRecipient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
  },
});
