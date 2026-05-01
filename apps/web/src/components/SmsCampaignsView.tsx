'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSmsCampaignStore, useCRMStore } from '@realestate-crm/hooks';
import type { SmsCampaign, SmsCampaignStatus, Contact } from '@realestate-crm/types';

const STATUS_STYLES: Record<SmsCampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sending: 'bg-yellow-50 text-yellow-700',
  sent: 'bg-green-50 text-green-700',
  failed: 'bg-red-50 text-red-700',
};

const STATUS_LABELS: Record<SmsCampaignStatus, string> = {
  draft: 'Draft',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
};

const MERGE_FIELDS = ['{{first_name}}', '{{last_name}}', '{{property_address}}'];
const SMS_CHAR_LIMIT = 160;

export default function SmsCampaignsView() {
  const campaigns = useSmsCampaignStore((s) => s.campaigns);
  const isLoading = useSmsCampaignStore((s) => s.isLoading);
  const fetchCampaigns = useSmsCampaignStore((s) => s.fetchCampaigns);
  const createCampaign = useSmsCampaignStore((s) => s.createCampaign);
  const updateCampaign = useSmsCampaignStore((s) => s.updateCampaign);
  const deleteCampaign = useSmsCampaignStore((s) => s.deleteCampaign);
  const addRecipients = useSmsCampaignStore((s) => s.addRecipients);
  const contacts = useCRMStore((s) => s.contacts);

  const [showCompose, setShowCompose] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');

  const [showAddRecipients, setShowAddRecipients] = useState<string | null>(null);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [addResult, setAddResult] = useState<{ added: number; skippedOptOut: number } | null>(null);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const resetForm = () => {
    setName('');
    setMessageTemplate('');
  };

  const handleCreate = async () => {
    const campaign = await createCampaign({
      name: name.trim() || 'Untitled SMS Campaign',
      message_template: messageTemplate,
      status: 'draft',
    });
    if (campaign) {
      setShowCompose(false);
      resetForm();
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    await updateCampaign(editingId, { name, message_template: messageTemplate });
    setEditingId(null);
    resetForm();
    setShowCompose(false);
  };

  const startEdit = (campaign: SmsCampaign) => {
    setEditingId(campaign.id);
    setName(campaign.name);
    setMessageTemplate(campaign.message_template);
    setShowCompose(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this SMS campaign?')) {
      await deleteCampaign(id);
    }
  };

  const filteredContactsForRecipients = useMemo(() => {
    const eligible = contacts.filter((c) => c.phone && !c.do_not_contact);
    if (!recipientSearch) return eligible.slice(0, 50);
    const q = recipientSearch.toLowerCase();
    return eligible
      .filter(
        (c) =>
          (c.first_name || '').toLowerCase().includes(q) ||
          (c.last_name || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q)
      )
      .slice(0, 50);
  }, [contacts, recipientSearch]);

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddRecipients = async (campaignId: string) => {
    if (selectedContactIds.size === 0) return;
    const selected: Contact[] = contacts.filter((c) => selectedContactIds.has(c.id));
    const result = await addRecipients(campaignId, selected);
    setAddResult(result);
    setSelectedContactIds(new Set());
    setShowAddRecipients(null);
    setRecipientSearch('');
  };

  const charCount = messageTemplate.length;
  const charsOverLimit = charCount > SMS_CHAR_LIMIT;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">{campaigns.length} SMS campaigns</p>
        <button
          onClick={() => {
            resetForm();
            setEditingId(null);
            setShowCompose(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New SMS Campaign
        </button>
      </div>

      {/* Compose form */}
      {showCompose && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            {editingId ? 'Edit SMS Campaign' : 'New SMS Campaign'}
          </h2>
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring Market Alert"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="mb-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Message</label>
            <div className="mb-2 flex gap-2">
              {MERGE_FIELDS.map((field) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => setMessageTemplate((prev) => prev + field)}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                >
                  {field.replace(/[{}]/g, '')}
                </button>
              ))}
            </div>
            <textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={4}
              placeholder="Hi {{first_name}}, ... Reply STOP to opt out."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className={charsOverLimit ? 'text-red-500' : 'text-gray-400'}>
                {charCount} / {SMS_CHAR_LIMIT} chars
                {charsOverLimit && ' — will split into multiple SMS segments'}
              </span>
              <span className="text-gray-400">Always include opt-out language (e.g. &quot;Reply STOP&quot;)</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowCompose(false);
                setEditingId(null);
                resetForm();
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={editingId ? handleUpdate : handleCreate}
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              {editingId ? 'Update' : 'Create Draft'}
            </button>
          </div>
        </div>
      )}

      {/* Add recipients result toast */}
      {addResult && (addResult.added > 0 || addResult.skippedOptOut > 0) && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Added {addResult.added} recipients
          {addResult.skippedOptOut > 0 && ` • Skipped ${addResult.skippedOptOut} (opted out / DNC)`}
          <button
            onClick={() => setAddResult(null)}
            className="ml-3 text-xs text-blue-600 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Campaigns table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading && campaigns.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-500">No SMS campaigns yet.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Recipients</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Sent</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Failed</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{campaign.name}</span>
                      <p className="text-xs text-gray-500 truncate max-w-[280px]">{campaign.message_template}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[campaign.status]}`}
                    >
                      {STATUS_LABELS[campaign.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{campaign.recipient_count ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{campaign.sent_count ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{campaign.failed_count ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      {campaign.status === 'draft' && (
                        <>
                          <button
                            onClick={() => setShowAddRecipients(campaign.id)}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="Add recipients"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => startEdit(campaign)}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="Edit"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                            </svg>
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(campaign.id)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        title="Delete"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add recipients modal */}
      {showAddRecipients && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Add SMS Recipients</h2>
              <button
                onClick={() => {
                  setShowAddRecipients(null);
                  setSelectedContactIds(new Set());
                  setRecipientSearch('');
                }}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <p className="mb-3 text-xs text-gray-500">
                Only contacts with a phone number and no DNC flag are shown. Opt-outs are filtered server-side.
              </p>
              <input
                type="text"
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                placeholder="Search by name or phone..."
                className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-gray-100 p-2">
                {filteredContactsForRecipients.length === 0 ? (
                  <p className="py-4 text-center text-xs text-gray-400">No eligible contacts.</p>
                ) : (
                  filteredContactsForRecipients.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 text-sm hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedContactIds.has(c.id)}
                        onChange={() => toggleContact(c.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="flex-1">
                        {c.first_name} {c.last_name}
                      </span>
                      <span className="text-xs text-gray-400">{c.phone}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAddRecipients(null);
                    setSelectedContactIds(new Set());
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAddRecipients(showAddRecipients)}
                  disabled={selectedContactIds.size === 0}
                  className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  Add ({selectedContactIds.size})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
