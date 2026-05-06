import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, ScrollView, Alert } from 'react-native';
import {
  useTheme, Text, Button, Surface, Chip, TextInput, IconButton,
  Portal, Dialog, ActivityIndicator, Switch, Divider,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useEmailCampaignStore, useCRMStore } from '@realestate-crm/hooks';
import type { CampaignStatus, Contact } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: '#6b7280', scheduled: '#2563eb', sending: '#f59e0b', sent: '#16a34a',
};

const MERGE_FIELDS = ['{{first_name}}', '{{last_name}}', '{{property_address}}'];

export default function CampaignDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const {
    activeCampaign, recipients, isLoading,
    fetchCampaign, createCampaign, updateCampaign, sendCampaign,
    addRecipients, removeRecipient,
  } = useEmailCampaignStore();

  const contacts = useCRMStore((s) => s.contacts);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showRecipientDialog, setShowRecipientDialog] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isNew && id) {
      fetchCampaign(id);
    }
  }, [id, isNew]);

  useEffect(() => {
    if (activeCampaign && !isNew) {
      setName(activeCampaign.name);
      setSubject(activeCampaign.subject);
      setBody(activeCampaign.body_text || activeCampaign.body_html || '');
    }
  }, [activeCampaign, isNew]);

  const isDraft = isNew || activeCampaign?.status === 'draft';

  const filteredContacts = useMemo(() => {
    if (!recipientSearch) return contacts.slice(0, 50);
    const q = recipientSearch.toLowerCase();
    return contacts
      .filter((c) =>
        (c.first_name || '').toLowerCase().includes(q) ||
        (c.last_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [contacts, recipientSearch]);

  const handleSave = useCallback(async () => {
    if (isNew) {
      const campaign = await createCampaign({
        name: name.trim() || 'Untitled Campaign',
        subject: subject.trim(),
        body_text: body,
        status: 'draft',
      });
      if (campaign) {
        router.replace(`/campaigns/${campaign.id}` as never);
      }
    } else if (id) {
      await updateCampaign(id, { name, subject, body_text: body });
    }
  }, [isNew, id, name, subject, body, createCampaign, updateCampaign, router]);

  const handleSend = useCallback(async () => {
    if (!id || isNew) return;
    Alert.alert('Send Campaign', 'Send this campaign to all recipients now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        style: 'destructive',
        onPress: async () => {
          await handleSave();
          await sendCampaign(id);
          router.back();
        },
      },
    ]);
  }, [id, isNew, handleSave, sendCampaign, router]);

  const handleAddRecipients = useCallback(async () => {
    if (!id || selectedContactIds.size === 0) return;
    const selected = contacts.filter((c) => selectedContactIds.has(c.id));
    await addRecipients(id, selected);
    setSelectedContactIds(new Set());
    setShowRecipientDialog(false);
    setRecipientSearch('');
  }, [id, selectedContactIds, contacts, addRecipients]);

  const toggleContact = (contactId: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const insertMergeField = (field: string) => {
    setBody((prev) => prev + field);
  };

  if (isLoading && !isNew) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: isNew ? 'New Campaign' : name || 'Campaign' }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Name & Subject */}
        <Surface style={styles.section} elevation={1}>
          <TextInput
            label="Campaign Name"
            value={name}
            onChangeText={setName}
            mode="outlined"
            disabled={!isDraft}
            style={styles.input}
          />
          <TextInput
            label="Subject Line"
            value={subject}
            onChangeText={setSubject}
            mode="outlined"
            disabled={!isDraft}
            style={styles.input}
          />
        </Surface>

        {/* Body */}
        <Surface style={styles.section} elevation={1}>
          <Text variant="titleSmall" style={{ marginBottom: 8 }}>Email Body</Text>
          {isDraft && (
            <View style={styles.mergeRow}>
              {MERGE_FIELDS.map((field) => (
                <Chip key={field} onPress={() => insertMergeField(field)} compact icon="code-braces">
                  {field.replace(/[{}]/g, '')}
                </Chip>
              ))}
            </View>
          )}
          <TextInput
            value={body}
            onChangeText={setBody}
            mode="outlined"
            multiline
            numberOfLines={8}
            disabled={!isDraft}
            style={[styles.input, { minHeight: 160 }]}
          />
        </Surface>

        {/* Recipients */}
        <Surface style={styles.section} elevation={1}>
          <View style={styles.sectionHeader}>
            <Text variant="titleSmall">Recipients ({recipients.length})</Text>
            {isDraft && !isNew && (
              <Button mode="outlined" compact onPress={() => setShowRecipientDialog(true)} icon="account-plus">
                Add
              </Button>
            )}
          </View>
          {recipients.length === 0 ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {isNew ? 'Save the campaign first to add recipients.' : 'No recipients added yet.'}
            </Text>
          ) : (
            recipients.map((r) => (
              <View key={r.id} style={styles.recipientRow}>
                <Icon name="email-outline" size={16} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodySmall" style={{ flex: 1 }}>{r.email}</Text>
                <Chip compact textStyle={{ fontSize: 10 }}>{r.status}</Chip>
                {isDraft && (
                  <IconButton icon="close" size={16} onPress={() => removeRecipient(r.id)} />
                )}
              </View>
            ))
          )}
        </Surface>

        {/* Stats (for sent campaigns) */}
        {!isDraft && activeCampaign && (
          <Surface style={styles.section} elevation={1}>
            <Text variant="titleSmall" style={{ marginBottom: 8 }}>Campaign Stats</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text variant="headlineSmall">{activeCampaign.sent_count ?? 0}</Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Sent</Text>
              </View>
              <View style={styles.statItem}>
                <Text variant="headlineSmall">{activeCampaign.opened_count ?? 0}</Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Opened</Text>
              </View>
              <View style={styles.statItem}>
                <Text variant="headlineSmall">{activeCampaign.recipient_count ?? 0}</Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Total</Text>
              </View>
            </View>
          </Surface>
        )}
      </ScrollView>

      {/* Action bar */}
      {isDraft && (
        <Surface style={styles.actionBar} elevation={3}>
          <Button mode="outlined" onPress={handleSave} icon="content-save">
            Save
          </Button>
          {!isNew && (
            <Button mode="contained" onPress={handleSend} icon="send" buttonColor="#16a34a">
              Send Now
            </Button>
          )}
        </Surface>
      )}

      {/* Add recipients dialog */}
      <Portal>
        <Dialog visible={showRecipientDialog} onDismiss={() => setShowRecipientDialog(false)}>
          <Dialog.Title>Add Recipients</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Search contacts"
              value={recipientSearch}
              onChangeText={setRecipientSearch}
              mode="outlined"
              left={<TextInput.Icon icon="magnify" />}
              style={{ marginBottom: 12 }}
            />
            <ScrollView style={{ maxHeight: 300 }}>
              {filteredContacts.map((c) => (
                <View key={c.id} style={styles.contactRow}>
                  <IconButton
                    icon={selectedContactIds.has(c.id) ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    onPress={() => toggleContact(c.id)}
                    size={20}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium">{c.first_name} {c.last_name}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{c.email || 'No email'}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowRecipientDialog(false)}>Cancel</Button>
            <Button onPress={handleAddRecipients} disabled={selectedContactIds.size === 0}>
              Add {selectedContactIds.size > 0 ? `(${selectedContactIds.size})` : ''}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, gap: 16, paddingBottom: 100 },
  section: { borderRadius: 12, padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  input: { marginBottom: 8 },
  mergeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  recipientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  actionBar: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
});
