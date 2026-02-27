'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useEmailCampaignStore, useCRMStore } from '@realestate-crm/hooks';
import type { EmailCampaign, CampaignStatus, Contact } from '@realestate-crm/types';

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-50 text-blue-700',
  sending: 'bg-yellow-50 text-yellow-700',
  sent: 'bg-green-50 text-green-700',
};

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
};

const MERGE_FIELDS = ['{{first_name}}', '{{last_name}}', '{{property_address}}'];

export default function CampaignsView() {
  const campaigns = useEmailCampaignStore((s) => s.campaigns);
  const recipients = useEmailCampaignStore((s) => s.recipients);
  const isLoading = useEmailCampaignStore((s) => s.isLoading);
  const fetchCampaigns = useEmailCampaignStore((s) => s.fetchCampaigns);
  const fetchCampaign = useEmailCampaignStore((s) => s.fetchCampaign);
  const createCampaign = useEmailCampaignStore((s) => s.createCampaign);
  const updateCampaign = useEmailCampaignStore((s) => s.updateCampaign);
  const deleteCampaign = useEmailCampaignStore((s) => s.deleteCampaign);
  const sendCampaign = useEmailCampaignStore((s) => s.sendCampaign);
  const addRecipients = useEmailCampaignStore((s) => s.addRecipients);
  const removeRecipient = useEmailCampaignStore((s) => s.removeRecipient);
  const contacts = useCRMStore((s) => s.contacts);

  const [showCompose, setShowCompose] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Recipient add state
  const [showAddRecipients, setShowAddRecipients] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleCreate = async () => {
    const campaign = await createCampaign({
      name: name.trim() || 'Untitled Campaign',
      subject: subject.trim(),
      body_text: body,
      status: 'draft',
    });
    if (campaign) {
      setShowCompose(false);
      resetForm();
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    await updateCampaign(editingId, { name, subject, body_text: body });
    setEditingId(null);
    resetForm();
  };

  const resetForm = () => {
    setName('');
    setSubject('');
    setBody('');
  };

  const startEdit = (campaign: EmailCampaign) => {
    setEditingId(campaign.id);
    setName(campaign.name);
    setSubject(campaign.subject);
    setBody(campaign.body_text || campaign.body_html || '');
    setShowCompose(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this campaign?')) {
      await deleteCampaign(id);
    }
  };

  const handleSend = async (id: string) => {
    if (window.confirm('Send this campaign to all recipients now?')) {
      await sendCampaign(id);
    }
  };

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    await fetchCampaign(id);
  };

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

  const handleAddRecipients = async (campaignId: string) => {
    if (selectedContactIds.size === 0) return;
    const selected = contacts.filter((c) => selectedContactIds.has(c.id));
    await addRecipients(campaignId, selected);
    setSelectedContactIds(new Set());
    setShowAddRecipients(false);
    setRecipientSearch('');
    await fetchCampaign(campaignId);
  };

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Campaigns</h1>
          <p className="text-sm text-gray-500">{campaigns.length} campaigns</p>
        </div>
        <button
          onClick={() => { resetForm(); setEditingId(null); setShowCompose(true); }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Campaign
        </button>
      </div>

      {/* Compose form */}
      {showCompose && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            {editingId ? 'Edit Campaign' : 'New Campaign'}
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Campaign Name</label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spring Open Home Invite"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Subject Line</label>
              <input
                type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. You're invited to our Open Home!"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="mb-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Body</label>
            <div className="mb-2 flex gap-2">
              {MERGE_FIELDS.map((field) => (
                <button
                  key={field}
                  onClick={() => setBody((prev) => prev + field)}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                >
                  {field.replace(/[{}]/g, '')}
                </button>
              ))}
            </div>
            <textarea
              value={body} onChange={(e) => setBody(e.target.value)}
              rows={6} placeholder="Write your email content here..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowCompose(false); setEditingId(null); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={editingId ? handleUpdate : handleCreate} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600">
              {editingId ? 'Update' : 'Create Draft'}
            </button>
          </div>
        </div>
      )}

      {/* Campaign table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading && campaigns.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-500">No campaigns yet.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Recipients</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Sent</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Opens</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {campaigns.map((campaign) => (
                <>
                  <tr key={campaign.id} className="cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => handleExpand(campaign.id)}>
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-gray-900">{campaign.name}</span>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">{campaign.subject}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[campaign.status]}`}>
                        {STATUS_LABELS[campaign.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{campaign.recipient_count ?? 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{campaign.sent_count ?? 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{campaign.opened_count ?? 0}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex gap-1">
                        {campaign.status === 'draft' && (
                          <>
                            <button onClick={() => startEdit(campaign)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Edit">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                            </button>
                            <button onClick={() => handleSend(campaign.id)} className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600" title="Send">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDelete(campaign.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" title="Delete">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Expanded recipients */}
                  {expandedId === campaign.id && (
                    <tr key={`${campaign.id}-detail`}>
                      <td colSpan={7} className="bg-gray-50 px-8 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-gray-700">Recipients</h3>
                          {campaign.status === 'draft' && (
                            <button
                              onClick={() => setShowAddRecipients(true)}
                              className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-white"
                            >
                              + Add Recipients
                            </button>
                          )}
                        </div>
                        {recipients.length === 0 ? (
                          <p className="text-xs text-gray-400">No recipients yet.</p>
                        ) : (
                          <div className="space-y-1">
                            {recipients.map((r) => (
                              <div key={r.id} className="flex items-center gap-3 text-sm">
                                <span className="text-gray-700">{r.email}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  r.status === 'opened' ? 'bg-green-50 text-green-700' :
                                  r.status === 'bounced' ? 'bg-red-50 text-red-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{r.status}</span>
                                {campaign.status === 'draft' && (
                                  <button onClick={() => removeRecipient(r.id)} className="text-gray-400 hover:text-red-500 text-xs">remove</button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add recipients inline */}
                        {showAddRecipients && (
                          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                            <input
                              type="text" value={recipientSearch} onChange={(e) => setRecipientSearch(e.target.value)}
                              placeholder="Search contacts..."
                              className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
                            />
                            <div className="max-h-40 overflow-y-auto space-y-1">
                              {filteredContacts.map((c) => (
                                <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                                  <input type="checkbox" checked={selectedContactIds.has(c.id)} onChange={() => toggleContact(c.id)} className="rounded border-gray-300" />
                                  {c.first_name} {c.last_name} <span className="text-gray-400">{c.email || 'no email'}</span>
                                </label>
                              ))}
                            </div>
                            <div className="mt-2 flex justify-end gap-2">
                              <button onClick={() => { setShowAddRecipients(false); setSelectedContactIds(new Set()); }} className="text-xs text-gray-500">Cancel</button>
                              <button onClick={() => handleAddRecipients(campaign.id)} disabled={selectedContactIds.size === 0} className="rounded bg-primary-500 px-3 py-1 text-xs text-white disabled:opacity-50">Add ({selectedContactIds.size})</button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
