import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Dialog,
  IconButton,
  Portal,
  Surface,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore, useSmsCampaignStore, useSmsTemplateStore } from '@realestate-crm/hooks';
import type { Contact, SmsCampaignStatus } from '@realestate-crm/types';

const SMS_CHAR_LIMIT = 160;
const STATUS_LABEL: Record<SmsCampaignStatus, string> = {
  draft: 'Draft',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
};
const STATUS_COLOR: Record<SmsCampaignStatus, string> = {
  draft: '#6b7280',
  sending: '#f59e0b',
  sent: '#16a34a',
  failed: '#ef4444',
};

const MERGE_FIELDS = ['{{first_name}}', '{{last_name}}', '{{property_address}}'];

export default function SmsCampaignDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  // Stores
  const campaigns = useSmsCampaignStore((s) => s.campaigns);
  const fetchCampaign = useSmsCampaignStore((s) => s.fetchCampaign);
  const createCampaign = useSmsCampaignStore((s) => s.createCampaign);
  const updateCampaign = useSmsCampaignStore((s) => s.updateCampaign);
  const deleteCampaign = useSmsCampaignStore((s) => s.deleteCampaign);
  const addRecipients = useSmsCampaignStore((s) => s.addRecipients);

  const templates = useSmsTemplateStore((s) => s.templates);
  const labels = useSmsTemplateStore((s) => s.labels);
  const fetchSmsAll = useSmsTemplateStore((s) => s.fetchAll);

  const contacts = useCRMStore((s) => s.contacts);

  // Composed campaign (existing or new)
  const existing = useMemo(
    () => (isNew ? null : campaigns.find((c) => c.id === id) || null),
    [campaigns, id, isNew]
  );

  const [name, setName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [recipientPickerVisible, setRecipientPickerVisible] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [pickedContactIds, setPickedContactIds] = useState<Set<string>>(new Set());
  const [addingRecipients, setAddingRecipients] = useState(false);

  // Track campaign id once we transition from 'new' to a real id (after first save)
  const [persistedId, setPersistedId] = useState<string | null>(isNew ? null : id || null);

  // Initialize fields from existing campaign
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    if (!isNew && existing) {
      setName(existing.name);
      setMessageTemplate(existing.message_template);
      initRef.current = true;
    } else if (isNew && !initRef.current) {
      setName('New SMS Campaign');
      setMessageTemplate('');
      initRef.current = true;
    }
  }, [existing, isNew]);

  // Lazy-load templates if empty
  useEffect(() => {
    if (templates.length === 0) fetchSmsAll();
  }, [templates.length, fetchSmsAll]);

  // Lazy-fetch the campaign so the existing data is current
  useEffect(() => {
    if (!isNew && id && !existing) fetchCampaign(id);
  }, [isNew, id, existing, fetchCampaign]);

  const filteredTemplates = useMemo(() => {
    if (!labelFilter) return templates;
    return templates.filter((t) => (t.labels || []).some((l) => l.id === labelFilter));
  }, [templates, labelFilter]);

  const charCount = messageTemplate.length;
  const overLimit = charCount > SMS_CHAR_LIMIT;

  const isReadOnly = !!existing && existing.status !== 'draft';
  const previewName = useMemo(() => {
    const first = contacts.find((c) => c.first_name);
    return first?.first_name || 'there';
  }, [contacts]);

  const handleApplyTemplate = useCallback((message: string) => {
    setMessageTemplate(message);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!name.trim() || !messageTemplate.trim()) return;
    setSavingDraft(true);
    try {
      if (persistedId && !isNew) {
        await updateCampaign(persistedId, {
          name: name.trim(),
          message_template: messageTemplate,
        });
      } else {
        const created = await createCampaign({
          name: name.trim(),
          message_template: messageTemplate,
          status: 'draft',
        });
        if (created) setPersistedId(created.id);
      }
    } finally {
      setSavingDraft(false);
    }
  }, [name, messageTemplate, persistedId, isNew, updateCampaign, createCampaign]);

  const handleDelete = useCallback(() => {
    if (!persistedId) {
      router.back();
      return;
    }
    Alert.alert('Delete campaign?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteCampaign(persistedId);
          router.back();
        },
      },
    ]);
  }, [persistedId, deleteCampaign, router]);

  const handleSend = useCallback(() => {
    if (!persistedId) return;
    const eligibleCount = (existing?.recipient_count ?? 0);
    if (eligibleCount === 0) {
      Alert.alert(
        'No recipients yet',
        'Add at least one recipient before sending.',
      );
      return;
    }
    Alert.alert(
      'Send SMS campaign?',
      `${eligibleCount} message${eligibleCount !== 1 ? 's' : ''} will be queued for delivery.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            await updateCampaign(persistedId, { status: 'sending' });
            // The server worker (or follow-up flow) actually transmits the messages —
            // marking 'sending' here surfaces the campaign as in-flight in the list.
          },
        },
      ],
    );
  }, [persistedId, existing, updateCampaign]);

  const eligibleContactsForRecipients = useMemo(() => {
    const eligible = contacts.filter((c) => c.phone && !c.do_not_contact);
    if (!recipientSearch.trim()) return eligible.slice(0, 100);
    const q = recipientSearch.toLowerCase();
    return eligible
      .filter(
        (c) =>
          (c.first_name || '').toLowerCase().includes(q) ||
          (c.last_name || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q),
      )
      .slice(0, 100);
  }, [contacts, recipientSearch]);

  const togglePickContact = useCallback((cid: string) => {
    setPickedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }, []);

  const handleAddRecipients = useCallback(async () => {
    if (!persistedId || pickedContactIds.size === 0) return;
    setAddingRecipients(true);
    try {
      const selected: Contact[] = contacts.filter((c) => pickedContactIds.has(c.id));
      const result = await addRecipients(persistedId, selected);
      setPickedContactIds(new Set());
      setRecipientPickerVisible(false);
      setRecipientSearch('');
      if (result.skippedOptOut > 0) {
        Alert.alert(
          'Some contacts skipped',
          `${result.added} added • ${result.skippedOptOut} skipped (opted out / DNC).`,
        );
      }
    } finally {
      setAddingRecipients(false);
    }
  }, [persistedId, pickedContactIds, contacts, addRecipients]);

  const insertMergeField = useCallback((field: string) => {
    setMessageTemplate((prev) => prev + field);
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: existing?.name || 'New SMS Campaign' }} />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Status row (for non-draft campaigns) */}
        {existing && (
          <View style={styles.statusRow}>
            <Chip
              compact
              style={{ backgroundColor: STATUS_COLOR[existing.status] + '15' }}
              textStyle={{ color: STATUS_COLOR[existing.status] }}
            >
              {STATUS_LABEL[existing.status]}
            </Chip>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
              {existing.recipient_count ?? 0} recipients
              {existing.status === 'sent' && ` • ${existing.sent_count ?? 0} sent`}
              {(existing.failed_count ?? 0) > 0 && ` • ${existing.failed_count} failed`}
            </Text>
          </View>
        )}

        {/* Name */}
        <Text variant="labelMedium" style={styles.label}>
          Campaign Name
        </Text>
        <TextInput
          mode="outlined"
          value={name}
          onChangeText={setName}
          editable={!isReadOnly}
          placeholder="e.g. Spring Open Home Invite"
          dense
        />

        {/* Templates section */}
        {!isReadOnly && (
          <>
            {labels.length > 0 && (
              <View style={styles.subSection}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                  Filter templates by label
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  <Chip
                    compact
                    selected={labelFilter === null}
                    onPress={() => setLabelFilter(null)}
                    style={styles.chip}
                  >
                    All
                  </Chip>
                  {labels.map((label) => (
                    <Chip
                      key={label.id}
                      compact
                      selected={labelFilter === label.id}
                      onPress={() => setLabelFilter((curr) => (curr === label.id ? null : label.id))}
                      style={[
                        styles.chip,
                        labelFilter === label.id && { backgroundColor: `${label.color}33` },
                      ]}
                      textStyle={labelFilter === label.id ? { color: label.color } : undefined}
                    >
                      {label.name}
                    </Chip>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.subSection}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                Templates
              </Text>
              {filteredTemplates.length === 0 ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {templates.length === 0
                    ? 'No templates yet — create some via the bulk SMS modal.'
                    : 'No templates with this label.'}
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {filteredTemplates.map((t) => (
                    <Chip
                      key={t.id}
                      compact
                      icon="message-text-outline"
                      onPress={() => handleApplyTemplate(t.message)}
                      style={styles.chip}
                    >
                      {t.name}
                    </Chip>
                  ))}
                </ScrollView>
              )}
            </View>
          </>
        )}

        {/* Merge fields */}
        {!isReadOnly && (
          <View style={styles.mergeRow}>
            {MERGE_FIELDS.map((field) => (
              <Chip
                key={field}
                compact
                icon="plus"
                onPress={() => insertMergeField(field)}
                style={styles.chip}
              >
                {field.replace(/[{}]/g, '')}
              </Chip>
            ))}
          </View>
        )}

        {/* Message body */}
        <Text variant="labelMedium" style={styles.label}>
          Message
        </Text>
        <TextInput
          mode="outlined"
          value={messageTemplate}
          onChangeText={setMessageTemplate}
          editable={!isReadOnly}
          multiline
          numberOfLines={6}
          placeholder="Hi {{first_name}}, ... Reply STOP to opt out."
          style={{ minHeight: 130 }}
        />
        <View style={styles.charRow}>
          <Text variant="bodySmall" style={{ color: overLimit ? '#ef4444' : theme.colors.onSurfaceVariant }}>
            {charCount} / {SMS_CHAR_LIMIT} chars
            {overLimit && ' — will split into multiple SMS segments'}
          </Text>
          {messageTemplate.includes('{{first_name}}') && (
            <Text variant="bodySmall" style={{ color: theme.colors.primary, marginTop: 2 }}>
              Preview: {messageTemplate.replace(/\{\{first_name\}\}/g, previewName)}
            </Text>
          )}
        </View>

        {/* Recipients section */}
        <View style={styles.subSection}>
          <View style={styles.recipientHeader}>
            <Text variant="labelMedium" style={styles.label}>
              Recipients
            </Text>
            {!isReadOnly && persistedId && (
              <Button
                compact
                icon="account-multiple-plus"
                onPress={() => setRecipientPickerVisible(true)}
              >
                Add
              </Button>
            )}
          </View>
          <Surface style={styles.recipientSurface} elevation={0}>
            <Icon name="account-group-outline" size={18} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyMedium" style={{ marginLeft: 8 }}>
              {existing?.recipient_count ?? 0} recipient{(existing?.recipient_count ?? 0) !== 1 ? 's' : ''}
            </Text>
            {!persistedId && (
              <Text variant="bodySmall" style={{ marginLeft: 'auto', color: theme.colors.onSurfaceVariant }}>
                Save draft first
              </Text>
            )}
          </Surface>
          {!isReadOnly && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              Opt-outs and Do-Not-Contact contacts are filtered automatically.
            </Text>
          )}
        </View>

        {/* Bottom action row */}
        <View style={styles.actionRow}>
          {!isReadOnly && (
            <>
              {persistedId ? (
                <Button
                  mode="outlined"
                  icon="content-save"
                  onPress={handleSaveDraft}
                  disabled={!name.trim() || !messageTemplate.trim() || savingDraft}
                  loading={savingDraft}
                  style={{ flex: 1 }}
                >
                  Save changes
                </Button>
              ) : (
                <Button
                  mode="outlined"
                  icon="content-save"
                  onPress={handleSaveDraft}
                  disabled={!name.trim() || !messageTemplate.trim() || savingDraft}
                  loading={savingDraft}
                  style={{ flex: 1 }}
                >
                  Save draft
                </Button>
              )}
              {persistedId && (
                <Button
                  mode="contained"
                  icon="send"
                  onPress={handleSend}
                  disabled={(existing?.recipient_count ?? 0) === 0}
                  style={{ flex: 1 }}
                >
                  Send
                </Button>
              )}
            </>
          )}
          {persistedId && existing?.status === 'draft' && (
            <IconButton icon="trash-can-outline" onPress={handleDelete} />
          )}
          {creating && <ActivityIndicator />}
        </View>
      </ScrollView>

      {/* Add recipients dialog */}
      <Portal>
        <Dialog
          visible={recipientPickerVisible}
          onDismiss={() => setRecipientPickerVisible(false)}
          style={styles.recipientDialog}
        >
          <Dialog.Title>Add recipients</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              dense
              placeholder="Search by name or phone..."
              value={recipientSearch}
              onChangeText={setRecipientSearch}
              style={{ marginBottom: 12 }}
            />
            <ScrollView style={styles.contactScroll}>
              {eligibleContactsForRecipients.length === 0 ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  No eligible contacts.
                </Text>
              ) : (
                eligibleContactsForRecipients.map((c) => {
                  const checked = pickedContactIds.has(c.id);
                  return (
                    <Chip
                      key={c.id}
                      icon={checked ? 'check' : 'account'}
                      selected={checked}
                      onPress={() => togglePickContact(c.id)}
                      style={[styles.contactChip, checked && { backgroundColor: theme.colors.primaryContainer }]}
                    >
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed'} • {c.phone}
                    </Chip>
                  );
                })
              )}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => { setRecipientPickerVisible(false); setPickedContactIds(new Set()); }}>
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleAddRecipients}
              loading={addingRecipients}
              disabled={pickedContactIds.size === 0 || addingRecipients}
            >
              Add ({pickedContactIds.size})
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  label: { marginTop: 8, marginBottom: 4 },
  subSection: { marginTop: 8 },
  chipRow: { flexDirection: 'row', gap: 6, paddingVertical: 4, paddingRight: 8 },
  chip: { marginRight: 6 },
  mergeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  charRow: { marginTop: 4 },
  recipientHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recipientSurface: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'center' },
  recipientDialog: { maxHeight: '80%' },
  contactScroll: { maxHeight: 320 },
  contactChip: { marginBottom: 6 },
});
