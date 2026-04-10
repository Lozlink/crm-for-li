import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View, FlatList, ScrollView, Linking, Platform, Pressable } from 'react-native';
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
import * as SMS from 'expo-sms';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Lazy-import CallerID native module (not available in Expo Go)
let CallerIdModule: {
  hasSmsPermission(): Promise<boolean>;
  requestSmsPermission(): Promise<boolean>;
  sendDirectSms(phone: string, message: string): Promise<{ success: boolean; error: string | null }>;
} | null = null;
try { CallerIdModule = require('caller-id').default; } catch { /* Expo Go / web */ }
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

const AVATAR_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'];

function getAvatarColor(name: string): string {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function RecipientAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: getAvatarColor(name),
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.38, fontWeight: '600' }}>{initials}</Text>
    </View>
  );
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

async function handleTaskSMS(task: Task, addActivity?: (activity: Omit<Activity, 'id' | 'created_at'>) => Promise<unknown> | void) {
  const contact = task.contact;
  if (!contact?.phone) return;
  const phone = sanitizePhone(contact.phone);
  const name = getContactDisplayName(contact) || 'there';
  const message = generateTaskMessage(task.type, name, {
    property: task.property?.address,
    date: task.due_at ? formatDueDate(task.due_at) : undefined,
    title: task.title,
  });
  const preview = message.length > 200 ? `${message.slice(0, 200)}…` : message;

  if (Platform.OS === 'android' && CallerIdModule) {
    const hasPermission = await CallerIdModule.hasSmsPermission();
    if (!hasPermission) {
      const granted = await CallerIdModule.requestSmsPermission();
      if (!granted) { Alert.alert('SMS Permission Required', 'Please grant SMS permission to send messages.'); return; }
    }
    const { success, error } = await CallerIdModule.sendDirectSms(phone, message);
    if (success && addActivity && contact.id) {
      void Promise.resolve(addActivity({ contact_id: contact.id, type: 'sms', content: `SMS sent: ${preview}` }))
        .catch((e: unknown) => console.warn('SMS activity log failed:', e));
    } else if (!success) {
      Alert.alert('SMS Failed', error || 'Could not send SMS.');
    }
  } else {
    const available = await SMS.isAvailableAsync();
    if (!available) { Alert.alert('SMS Not Available', 'SMS is not supported on this device.'); return; }
    const { result } = await SMS.sendSMSAsync([phone], message);
    if (addActivity && contact.id) {
      if (result === 'sent') {
        void Promise.resolve(addActivity({ contact_id: contact.id, type: 'sms', content: `SMS sent: ${preview}` }))
          .catch((e: unknown) => console.warn('SMS activity log failed:', e));
      } else if (result === 'unknown') {
        void Promise.resolve(addActivity({ contact_id: contact.id, type: 'sms', content: `SMS initiated: ${preview}` }))
          .catch((e: unknown) => console.warn('SMS activity log failed:', e));
      }
    }
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
  const [isSendingCurrentSms, setIsSendingCurrentSms] = useState(false);
  const isSendingRef = useRef(false);

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

  // Auto-send ref: triggers sendSMSAsync automatically when index advances
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const useDirectSend = Platform.OS === 'android' && CallerIdModule != null;

  const handleStartBulkSend = useCallback(async () => {
    if (useDirectSend) {
      const hasPermission = await CallerIdModule!.hasSmsPermission();
      if (!hasPermission) {
        const granted = await CallerIdModule!.requestSmsPermission();
        if (!granted) {
          Alert.alert('SMS Permission Required', 'Please grant SMS permission to send messages directly from the app.');
          return;
        }
      }
    } else {
      const available = await SMS.isAvailableAsync();
      if (!available) {
        Alert.alert('SMS Not Available', 'SMS is not supported on this device.');
        return;
      }
    }
    setBulkSmsPhase('sending');
    setBulkSmsCurrentIndex(0);
    setBulkSmsSentCount(0);
    setBulkSmsSkippedCount(0);
  }, []);

  const currentBulkTask = bulkSmsEligibleTasks[bulkSmsCurrentIndex] as Task | undefined;

  const advanceBulkSmsTasks = useCallback((nextIdx: number) => {
    if (nextIdx >= bulkSmsEligibleTasks.length) {
      setBulkSmsPhase('done');
    } else {
      setBulkSmsCurrentIndex(nextIdx);
    }
  }, [bulkSmsEligibleTasks.length]);

  const logSmsActivity = useCallback((contactId: string, message: string, status: 'sent' | 'initiated') => {
    const preview = message.length > 200 ? `${message.slice(0, 200)}…` : message;
    addActivity({
      contact_id: contactId,
      type: 'sms',
      content: `SMS ${status}: ${preview}`,
    }).catch((e: unknown) => console.warn('SMS activity log failed:', e));
  }, [addActivity]);

  const handleSendCurrentSms = useCallback(async () => {
    if (!currentBulkTask?.contact?.phone || isSendingRef.current) return;
    isSendingRef.current = true;
    setIsSendingCurrentSms(true);

    const phone = sanitizePhone(currentBulkTask.contact.phone);
    const contactName = getContactDisplayName(currentBulkTask.contact) || 'there';
    const personalizedMessage = bulkSmsMessage.replace(/\{name\}/g, contactName);

    try {
      if (useDirectSend) {
        const { success, error } = await CallerIdModule!.sendDirectSms(phone, personalizedMessage);
        if (success) {
          if (currentBulkTask.contact.id) logSmsActivity(currentBulkTask.contact.id, personalizedMessage, 'sent');
          setBulkSmsSentCount(prev => prev + 1);
          advanceBulkSmsTasks(bulkSmsCurrentIndex + 1);
        } else {
          Alert.alert('SMS Failed', error || 'Could not send SMS. Please try again.');
        }
      } else {
        const { result } = await SMS.sendSMSAsync([phone], personalizedMessage);
        if (result === 'sent') {
          if (currentBulkTask.contact.id) logSmsActivity(currentBulkTask.contact.id, personalizedMessage, 'sent');
          setBulkSmsSentCount(prev => prev + 1);
          advanceBulkSmsTasks(bulkSmsCurrentIndex + 1);
        } else if (result === 'unknown') {
          if (currentBulkTask.contact.id) logSmsActivity(currentBulkTask.contact.id, personalizedMessage, 'initiated');
          setBulkSmsSentCount(prev => prev + 1);
          advanceBulkSmsTasks(bulkSmsCurrentIndex + 1);
        } else {
          const displayName = contactName !== 'there' ? contactName : 'this contact';
          Alert.alert(
            'SMS Interrupted',
            `You cancelled your message to ${displayName}. What would you like to do?`,
            [
              { text: `Skip ${displayName}`, onPress: () => { setBulkSmsSkippedCount(prev => prev + 1); advanceBulkSmsTasks(bulkSmsCurrentIndex + 1); } },
              { text: `Retry ${displayName}`, onPress: () => {} },
              { text: 'Cancel Bulk SMS', style: 'destructive', onPress: () => { setBulkSmsPhase('done'); } },
            ],
          );
        }
      }
    } catch {
      Alert.alert('SMS Error', 'Could not send SMS. Please try again.');
    } finally {
      isSendingRef.current = false;
      setIsSendingCurrentSms(false);
    }
  }, [currentBulkTask, bulkSmsMessage, bulkSmsCurrentIndex, advanceBulkSmsTasks, logSmsActivity]);

  const handleSkipCurrentSms = useCallback(() => {
    setBulkSmsSkippedCount(prev => prev + 1);
    advanceBulkSmsTasks(bulkSmsCurrentIndex + 1);
  }, [bulkSmsCurrentIndex, advanceBulkSmsTasks]);

  const handleStopBulkSend = useCallback(() => {
    setBulkSmsPhase('done');
  }, []);

  // Auto-advance: when phase is 'sending' and index changes, auto-trigger next SMS after a brief delay
  useEffect(() => {
    if (bulkSmsPhase !== 'sending' || !currentBulkTask?.contact?.phone || isSendingRef.current) return;
    if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
    autoSendTimerRef.current = setTimeout(() => {
      handleSendCurrentSms();
    }, 800);
    return () => {
      if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
    };
  }, [bulkSmsPhase, bulkSmsCurrentIndex, currentBulkTask, handleSendCurrentSms]);

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
          onDismiss={bulkSmsPhase !== 'sending' ? handleCloseBulkSms : undefined}
          contentContainerStyle={[
            styles.bulkSmsModal,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          {/* ── Header ── */}
          <View style={[styles.broadcastHeader, { borderBottomColor: theme.colors.outlineVariant }]}>
            <Button
              compact
              onPress={handleCloseBulkSms}
              textColor={theme.colors.onSurface}
              disabled={bulkSmsPhase === 'sending' && isSendingCurrentSms}
            >
              Cancel
            </Button>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text variant="titleMedium" style={{ fontWeight: '700' }}>Bulk SMS</Text>
              {bulkSmsPhase === 'sending' && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Sending {bulkSmsCurrentIndex + 1} of {bulkSmsEligibleTasks.length}
                </Text>
              )}
            </View>
            {bulkSmsPhase === 'compose' ? (
              <Button
                compact
                mode="contained"
                onPress={handleStartBulkSend}
                disabled={bulkSmsEligibleTasks.length === 0 || !bulkSmsMessage.trim()}
              >
                Send
              </Button>
            ) : bulkSmsPhase === 'sending' ? (
              <Button
                compact
                onPress={handleSkipCurrentSms}
                textColor={theme.colors.onSurfaceVariant}
                disabled={isSendingCurrentSms}
              >
                Skip
              </Button>
            ) : (
              <Button compact mode="contained" onPress={handleCloseBulkSms}>
                Done
              </Button>
            )}
          </View>

          <ScrollView style={styles.broadcastBody} keyboardShouldPersistTaps="handled">
            {/* ── Recipients row ── */}
            {(() => {
              const eligibleContacts = bulkSmsEligibleTasks.map(t => ({
                id: t.id,
                name: getContactDisplayName(t.contact) || 'Unknown',
                phone: t.contact?.phone,
              }));
              return (
                <View style={[styles.recipientsRow, { backgroundColor: theme.colors.surfaceVariant }]}>
                  <View style={styles.recipientAvatarRow}>
                    {eligibleContacts.slice(0, 4).map((c, idx) => {
                      const isCurrentInSending = bulkSmsPhase === 'sending' && idx === bulkSmsCurrentIndex;
                      return (
                        <View
                          key={c.id}
                          style={[
                            styles.avatarWrapper,
                            isCurrentInSending && {
                              borderWidth: 2,
                              borderColor: theme.colors.primary,
                              borderRadius: 22,
                              padding: 2,
                            },
                          ]}
                        >
                          <RecipientAvatar name={c.name} size={36} />
                        </View>
                      );
                    })}
                    {eligibleContacts.length > 4 && (
                      <View style={[styles.overflowBadge, { backgroundColor: theme.colors.primary }]}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                          +{eligibleContacts.length - 4}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text variant="labelMedium" style={{ color: theme.colors.onSurface }}>
                      {eligibleContacts.length} recipient{eligibleContacts.length !== 1 ? 's' : ''}
                    </Text>
                    {bulkSmsSkippedTasks.length > 0 && (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {bulkSmsSkippedTasks.length} skipped (no phone)
                      </Text>
                    )}
                    {bulkSmsPhase === 'sending' && currentBulkTask && (
                      <Text variant="bodySmall" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                        Now: {getContactDisplayName(currentBulkTask.contact) || 'Unknown'}
                      </Text>
                    )}
                  </View>
                  <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                </View>
              );
            })()}

            {/* ── Current recipient card (sending phase) ── */}
            {bulkSmsPhase === 'sending' && currentBulkTask && (
              <Surface
                style={[styles.currentRecipientCard, { backgroundColor: theme.colors.primaryContainer }]}
                elevation={0}
              >
                <RecipientAvatar name={getContactDisplayName(currentBulkTask.contact) || 'Unknown'} size={44} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text variant="bodyLarge" style={{ fontWeight: '700', color: theme.colors.onPrimaryContainer }}>
                    {getContactDisplayName(currentBulkTask.contact) || 'Unknown'}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.8 }}>
                    {currentBulkTask.contact?.phone}
                  </Text>
                </View>
                {isSendingCurrentSms && (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                )}
              </Surface>
            )}

            {/* ── Message template editor ── */}
            <View style={styles.messageSection}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                Message (use {'{name}'} for personalized name)
              </Text>
              <TextInput
                value={bulkSmsMessage}
                onChangeText={setBulkSmsMessage}
                mode="outlined"
                multiline
                numberOfLines={6}
                editable={bulkSmsPhase !== 'sending'}
                style={styles.messageInput}
              />
              {bulkSmsPhase === 'compose' && bulkSmsMessage.includes('{name}') && bulkSmsEligibleTasks[0]?.contact && (
                <Text variant="bodySmall" style={{ color: theme.colors.primary, marginTop: 4 }}>
                  Preview: {bulkSmsMessage.replace(/\{name\}/g, getContactDisplayName(bulkSmsEligibleTasks[0].contact) || 'there')}
                </Text>
              )}
            </View>

            {/* ── Done summary ── */}
            {bulkSmsPhase === 'done' && (
              <Surface
                style={[styles.doneSummary, { backgroundColor: theme.colors.secondaryContainer }]}
                elevation={0}
              >
                <Icon name="check-circle" size={28} color="#16a34a" />
                <View style={{ marginLeft: 12 }}>
                  <Text variant="titleSmall" style={{ fontWeight: '700' }}>Bulk SMS Complete</Text>
                  <Text variant="bodyMedium" style={{ marginTop: 2 }}>
                    {bulkSmsSentCount} sent
                    {bulkSmsSkippedCount > 0 ? `, ${bulkSmsSkippedCount} skipped` : ''}
                    {bulkSmsSkippedTasks.length > 0 ? `, ${bulkSmsSkippedTasks.length} had no phone` : ''}
                  </Text>
                </View>
              </Surface>
            )}

            {/* ── Send action (sending phase) ── */}
            {bulkSmsPhase === 'sending' && currentBulkTask && (
              <View style={styles.sendActionRow}>
                <Button
                  mode="contained"
                  icon="message-text"
                  onPress={handleSendCurrentSms}
                  loading={isSendingCurrentSms}
                  disabled={isSendingCurrentSms}
                  style={{ flex: 1 }}
                >
                  {isSendingCurrentSms
                    ? 'Opening SMS...'
                    : `Opening SMS for ${(getContactDisplayName(currentBulkTask.contact) || 'Unknown').split(' ')[0]}...`}
                </Button>
              </View>
            )}
          </ScrollView>
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
    marginHorizontal: 0,
    marginTop: 48,
    marginBottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    maxHeight: '92%',
    flex: 1,
  },
  broadcastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  broadcastBody: {
    flex: 1,
  },
  recipientsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  recipientAvatarRow: {
    flexDirection: 'row',
    gap: 6,
  },
  avatarWrapper: {},
  overflowBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentRecipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
  },
  messageSection: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  messageInput: {
    minHeight: 120,
  },
  doneSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  sendActionRow: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    flexDirection: 'row',
  },
});
