import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, TouchableOpacity } from 'react-native';
import {
  Text,
  useTheme,
  Surface,
  Chip,
  Button,
  Dialog,
  Portal,
  TextInput,
  ActivityIndicator,
} from 'react-native-paper';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useComplianceStore, useCRMStore } from '@realestate-crm/hooks';
import { formatRelativeDate } from '@realestate-crm/utils';
import type {
  ComplianceAlert,
  ComplianceAlertSeverity,
  ComplianceAlertStatus,
} from '@realestate-crm/types';

// ── Helpers ──────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<ComplianceAlertSeverity, string> = {
  info: '#6366f1',
  low: '#16a34a',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#dc2626',
};

const STATUS_LABELS: Record<ComplianceAlertStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  investigating: 'Investigating',
  escalated: 'Escalated',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
  false_positive: 'False positive',
};

const TERMINAL_STATUSES: readonly ComplianceAlertStatus[] = [
  'resolved',
  'dismissed',
  'false_positive',
];

type ResolutionType = 'resolved' | 'dismissed' | 'false_positive';

const RESOLUTION_LABELS: Record<ResolutionType, string> = {
  resolved: 'Resolve',
  dismissed: 'Dismiss',
  false_positive: 'False positive',
};

// Type guards for triggerData (Record<string, unknown>) — never cast, always
// narrow, so a payload-shape drift degrades to the generic key/value view
// instead of rendering garbage.
function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string')
    ? value
    : null;
}

function formatAud(amount: number): string {
  return `$${amount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "below_threshold_pattern" / "pepCategory" → "Below threshold pattern" / "Pep category" */
function humanizeKey(key: string): string {
  const words = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

function stringifyTriggerValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ── Component ────────────────────────────────────────────────────────

export default function ComplianceAlertDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const suiteEnabled = useComplianceStore(s => s.suiteEnabled);
  const alertItem = useComplianceStore(s => s.alerts.find(a => a.id === id));
  const alertsLoading = useComplianceStore(s => s.alertsLoading);
  const fetchAlerts = useComplianceStore(s => s.fetchAlerts);
  const updateAlertStatus = useComplianceStore(s => s.updateAlertStatus);
  const resolveAlert = useComplianceStore(s => s.resolveAlert);
  const escalateAlert = useComplianceStore(s => s.escalateAlert);

  const contacts = useCRMStore(s => s.contacts);

  // Deep link straight to this screen → alerts may not be in the store yet.
  // Suite off → no fetch at all; the render below shows the opt-in fallback.
  useEffect(() => {
    if (!suiteEnabled) return;
    if (!alertItem) void fetchAlerts();
  }, [suiteEnabled, alertItem, fetchAlerts]);

  // Map the alert's IntelliCompli customer back to a CRM contact, if linked.
  const linkedContact = useMemo(() => {
    if (!alertItem?.customerId) return null;
    return contacts.find(c => c.intellicompli_customer_id === alertItem.customerId) ?? null;
  }, [contacts, alertItem?.customerId]);

  // Per-action busy flag so each button can show its own spinner.
  const [actionBusy, setActionBusy] = useState<'acknowledge' | 'investigate' | 'resolve' | 'escalate' | null>(null);

  // Resolution dialog (optional notes) + escalation dialog (required reason)
  const [resolveType, setResolveType] = useState<ResolutionType | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [escalateVisible, setEscalateVisible] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');

  const handleStatusChange = useCallback(async (status: 'acknowledged' | 'investigating') => {
    if (!id) return;
    setActionBusy(status === 'acknowledged' ? 'acknowledge' : 'investigate');
    try {
      await updateAlertStatus(id, status);
    } finally {
      setActionBusy(null);
    }
  }, [id, updateAlertStatus]);

  const handleResolve = useCallback(async () => {
    if (!id || !resolveType) return;
    setActionBusy('resolve');
    try {
      const notes = resolveNotes.trim();
      await resolveAlert(id, resolveType, notes ? notes : undefined);
      setResolveType(null);
      setResolveNotes('');
    } finally {
      setActionBusy(null);
    }
  }, [id, resolveType, resolveNotes, resolveAlert]);

  const handleEscalate = useCallback(async () => {
    if (!id || !escalateReason.trim()) return;
    setActionBusy('escalate');
    try {
      await escalateAlert(id, escalateReason.trim());
      setEscalateVisible(false);
      setEscalateReason('');
    } finally {
      setActionBusy(null);
    }
  }, [id, escalateReason, escalateAlert]);

  // Suite-off fallback — mirrors the compliance tab. Deep links can land here
  // with the suite disabled; never show triage UI (or its mutation actions).
  if (!suiteEnabled) {
    return (
      <>
        <Stack.Screen options={{ title: 'Compliance Alert' }} />
        <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
          <Icon name="shield-off-outline" size={40} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginTop: 12 }}>
            Compliance Suite is off
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center', marginHorizontal: 32 }}
          >
            Turn it on in Settings to screen contacts and triage alerts.
          </Text>
          <Button
            mode="contained-tonal"
            style={{ marginTop: 16 }}
            onPress={() => router.push('/(tabs)/settings' as never)}
          >
            Open Settings
          </Button>
        </View>
      </>
    );
  }

  if (!alertItem) {
    return (
      <>
        <Stack.Screen options={{ title: 'Compliance Alert' }} />
        <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
          {alertsLoading ? (
            <ActivityIndicator size="large" />
          ) : (
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              Alert not found
            </Text>
          )}
        </View>
      </>
    );
  }

  const severityColor = SEVERITY_COLORS[alertItem.severity];
  const isTerminal = TERMINAL_STATUSES.includes(alertItem.status);

  return (
    <>
      <Stack.Screen options={{ title: alertItem.alertNumber }} />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
      >
        {/* ===== HEADER ===== */}
        <Surface style={[styles.headerCard, { borderLeftColor: severityColor }]} elevation={1}>
          <View style={styles.headerInner}>
            <Text variant="titleMedium" style={{ fontWeight: '700' }}>
              {alertItem.title}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {alertItem.alertNumber} · {formatRelativeDate(alertItem.createdAt)}
            </Text>
            <View style={styles.chipRow}>
              <Chip
                compact
                style={{ backgroundColor: `${severityColor}18` }}
                textStyle={{ color: severityColor, fontSize: 11, fontWeight: '700' }}
              >
                {alertItem.severity.toUpperCase()}
              </Chip>
              <Chip compact textStyle={styles.chipText}>
                {STATUS_LABELS[alertItem.status]}
              </Chip>
              {alertItem.slaBreached && (
                <Chip
                  compact
                  icon="clock-alert-outline"
                  style={{ backgroundColor: theme.colors.errorContainer }}
                  textStyle={[styles.chipText, { color: theme.colors.error }]}
                >
                  SLA breached
                </Chip>
              )}
              {alertItem.isEscalated && (
                <Chip compact icon="arrow-up-bold" textStyle={styles.chipText}>
                  Escalated
                </Chip>
              )}
            </View>
            <Text variant="bodyMedium" style={{ marginTop: 10 }}>
              {alertItem.description}
            </Text>
          </View>
        </Surface>

        {/* ===== LINKED CONTACT ===== */}
        {linkedContact && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push(`/contact/${linkedContact.id}` as never)}
          >
            <Surface style={styles.sectionCard} elevation={1}>
              <View style={styles.contactRow}>
                <Icon name="account-circle-outline" size={24} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Linked contact
                  </Text>
                  <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                    {[linkedContact.first_name, linkedContact.last_name].filter(Boolean).join(' ')}
                  </Text>
                </View>
                <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
              </View>
            </Surface>
          </TouchableOpacity>
        )}

        {/* ===== TRIGGER DETAILS ===== */}
        <Surface style={styles.sectionCard} elevation={1}>
          <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: 8 }}>
            Detection details
          </Text>
          <TriggerDataSection alert={alertItem} />
        </Surface>

        {/* ===== RESOLUTION (terminal alerts) ===== */}
        {isTerminal && (
          <Surface style={styles.sectionCard} elevation={1}>
            <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: 8 }}>
              Resolution
            </Text>
            <DetailRow label="Outcome" value={STATUS_LABELS[alertItem.status]} />
            {alertItem.resolutionNotes ? (
              <DetailRow label="Notes" value={alertItem.resolutionNotes} />
            ) : null}
          </Surface>
        )}

        {/* ===== ACTIONS ===== */}
        {!isTerminal && (
          <Surface style={styles.sectionCard} elevation={1}>
            <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: 12 }}>
              Actions
            </Text>
            <View style={styles.actionsRow}>
              {alertItem.status === 'new' && (
                <Button
                  mode="contained-tonal"
                  icon="check"
                  compact
                  loading={actionBusy === 'acknowledge'}
                  disabled={actionBusy !== null}
                  onPress={() => handleStatusChange('acknowledged')}
                >
                  Acknowledge
                </Button>
              )}
              {(alertItem.status === 'new' || alertItem.status === 'acknowledged') && (
                <Button
                  mode="contained-tonal"
                  icon="magnify"
                  compact
                  loading={actionBusy === 'investigate'}
                  disabled={actionBusy !== null}
                  onPress={() => handleStatusChange('investigating')}
                >
                  Start investigation
                </Button>
              )}
              <Button
                mode="outlined"
                icon="check-circle-outline"
                compact
                disabled={actionBusy !== null}
                onPress={() => setResolveType('resolved')}
              >
                Resolve
              </Button>
              <Button
                mode="outlined"
                icon="close-circle-outline"
                compact
                disabled={actionBusy !== null}
                onPress={() => setResolveType('dismissed')}
              >
                Dismiss
              </Button>
              <Button
                mode="outlined"
                icon="cancel"
                compact
                disabled={actionBusy !== null}
                onPress={() => setResolveType('false_positive')}
              >
                False positive
              </Button>
              {!alertItem.isEscalated && (
                <Button
                  mode="outlined"
                  icon="arrow-up-bold"
                  compact
                  textColor={theme.colors.error}
                  disabled={actionBusy !== null}
                  onPress={() => setEscalateVisible(true)}
                >
                  Escalate
                </Button>
              )}
            </View>
          </Surface>
        )}
      </ScrollView>

      <Portal>
        {/* Resolve / Dismiss / False positive — optional notes */}
        <Dialog visible={resolveType !== null} onDismiss={() => setResolveType(null)}>
          <Dialog.Title>{resolveType ? RESOLUTION_LABELS[resolveType] : ''}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Notes (optional)"
              value={resolveNotes}
              onChangeText={setResolveNotes}
              mode="outlined"
              multiline
              numberOfLines={3}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setResolveType(null)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleResolve}
              loading={actionBusy === 'resolve'}
              disabled={actionBusy !== null}
            >
              Confirm
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Escalate — reason required */}
        <Dialog visible={escalateVisible} onDismiss={() => setEscalateVisible(false)}>
          <Dialog.Title>Escalate alert</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Reason"
              value={escalateReason}
              onChangeText={setEscalateReason}
              mode="outlined"
              multiline
              numberOfLines={3}
              placeholder="Why is this being escalated?"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEscalateVisible(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleEscalate}
              loading={actionBusy === 'escalate'}
              disabled={actionBusy !== null || !escalateReason.trim()}
            >
              Escalate
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

// ── Trigger data (typed by ruleCode) ─────────────────────────────────

function TriggerDataSection({ alert }: { alert: ComplianceAlert }) {
  const theme = useTheme();
  const data = alert.triggerData ?? {};

  if (alert.ruleCode === 'PEP_DETECTION') {
    const pepName = asString(data.pepName);
    const position = asString(data.position);
    const pepCategory = asString(data.pepCategory);
    const country = asString(data.country);
    const matchScore = asNumber(data.matchScore);
    return (
      <View>
        {pepName && <DetailRow label="Name" value={pepName} />}
        {position && <DetailRow label="Position" value={position} />}
        {pepCategory && <DetailRow label="PEP category" value={humanizeKey(pepCategory)} />}
        {country && <DetailRow label="Country" value={country.toUpperCase()} />}
        {matchScore !== null && (
          <DetailRow label="Match score" value={`${Math.round(matchScore * 100)}%`} />
        )}
      </View>
    );
  }

  if (alert.ruleCode === 'STRUCTURING_DETECTED') {
    const indicators = asStringArray(data.indicators);
    const totalAmount = asNumber(data.totalAmount);
    const transactionCount = asNumber(data.transactionCount);
    return (
      <View>
        {totalAmount !== null && <DetailRow label="Total amount" value={formatAud(totalAmount)} />}
        {transactionCount !== null && (
          <DetailRow label="Transactions" value={String(transactionCount)} />
        )}
        {indicators && indicators.length > 0 && (
          <View style={{ marginTop: 4 }}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
              Indicators
            </Text>
            {indicators.map(indicator => (
              <View key={indicator} style={styles.indicatorRow}>
                <Icon name="circle-small" size={18} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodyMedium">{humanizeKey(indicator)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  // Unknown rule codes — generic key/value rows so new IntelliCompli rules
  // still surface something useful without an app update.
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return (
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        No additional details
      </Text>
    );
  }
  return (
    <View>
      {entries.map(([key, value]) => (
        <DetailRow key={key} label={humanizeKey(key)} value={stringifyTriggerValue(value)} />
      ))}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  headerCard: {
    borderRadius: 12,
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  headerInner: {
    padding: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  chipText: {
    fontSize: 11,
  },
  sectionCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailRow: {
    marginBottom: 8,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
