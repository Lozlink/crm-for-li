'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCRMStore } from '@realestate-crm/hooks';
import type { Contact } from '@realestate-crm/types';
import ContactFormDialog from './ContactFormDialog';
import CSVImport from './CSVImport';

type SortField = 'name' | 'email' | 'address' | 'created_at';
type SortDir = 'asc' | 'desc';

export default function ContactsTable() {
  const contacts = useCRMStore((s) => s.contacts);
  const tags = useCRMStore((s) => s.tags);
  const deleteContact = useCRMStore((s) => s.deleteContact);
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showForm, setShowForm] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  }, []);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [sortField]
  );

  const filtered = useMemo(() => {
    let result = [...contacts];

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.first_name?.toLowerCase().includes(q) ||
          c.last_name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.address?.toLowerCase().includes(q)
      );
    }

    // Tag filter
    if (selectedTagIds.length > 0) {
      result = result.filter(
        (c) => c.tag_id && selectedTagIds.includes(c.tag_id)
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string;
      let bVal: string;

      switch (sortField) {
        case 'name':
          aVal = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
          bVal = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
          break;
        case 'email':
          aVal = (a.email || '').toLowerCase();
          bVal = (b.email || '').toLowerCase();
          break;
        case 'address':
          aVal = (a.address || '').toLowerCase();
          bVal = (b.address || '').toLowerCase();
          break;
        case 'created_at':
        default:
          aVal = a.created_at || '';
          bVal = b.created_at || '';
          break;
      }

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [contacts, search, selectedTagIds, sortField, sortDir]);

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
        await deleteContact(id);
      }
    },
    [deleteContact]
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} of {contacts.length} contacts
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCSVImport(true)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Import CSV
          </button>
          <button
            onClick={() => {
              setEditingContact(null);
              setShowForm(true);
            }}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            + Add Contact
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </div>

        {/* Tag filters */}
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedTagIds.includes(tag.id)
                  ? 'border-transparent text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
              style={
                selectedTagIds.includes(tag.id)
                  ? { backgroundColor: tag.color }
                  : {}
              }
            >
              {tag.name}
            </button>
          ))}
          {selectedTagIds.length > 0 && (
            <button
              onClick={() => setSelectedTagIds([])}
              className="rounded-full px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <SortHeader
                label="Name"
                field="name"
                current={sortField}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Email"
                field="email"
                current={sortField}
                dir={sortDir}
                onSort={handleSort}
              />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Phone
              </th>
              <SortHeader
                label="Address"
                field="address"
                current={sortField}
                dir={sortDir}
                onSort={handleSort}
              />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Tag
              </th>
              <SortHeader
                label="Added"
                field="created_at"
                current={sortField}
                dir={sortDir}
                onSort={handleSort}
              />
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="py-12 text-center text-sm text-gray-400"
                >
                  {contacts.length === 0
                    ? 'No contacts yet. Add your first contact to get started.'
                    : 'No contacts match your search.'}
                </td>
              </tr>
            ) : (
              filtered.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  onEdit={() => {
                    setEditingContact(contact);
                    setShowForm(true);
                  }}
                  onDelete={() =>
                    handleDelete(
                      contact.id,
                      `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
                    )
                  }
                  onClick={() => router.push(`/contacts/${contact.id}`)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Form dialog */}
      {showForm && (
        <ContactFormDialog
          contact={editingContact}
          onClose={() => {
            setShowForm(false);
            setEditingContact(null);
          }}
        />
      )}

      {/* CSV Import dialog */}
      {showCSVImport && (
        <CSVImport onClose={() => setShowCSVImport(false)} />
      )}
    </div>
  );
}

function SortHeader({
  label,
  field,
  current,
  dir,
  onSort,
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = current === field;
  return (
    <th
      className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:text-gray-700"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span className="text-primary-500">
            {dir === 'asc' ? '\u2191' : '\u2193'}
          </span>
        )}
      </span>
    </th>
  );
}

function ContactRow({
  contact,
  onEdit,
  onDelete,
  onClick,
}: {
  contact: Contact;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
}) {
  const displayName = [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(' ');

  return (
    <tr
      className="cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: contact.tag?.color || '#9CA3AF' }}
          >
            {(contact.first_name?.[0] || '?').toUpperCase()}
          </div>
          <span className="text-sm font-medium text-gray-900">
            {displayName || 'Unnamed'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {contact.email || '-'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {contact.phone ? (
          <a
            href={`tel:${contact.phone}`}
            className="text-primary-500 hover:text-primary-600"
            onClick={(e) => e.stopPropagation()}
          >
            {contact.phone}
          </a>
        ) : (
          '-'
        )}
      </td>
      <td className="max-w-[200px] px-4 py-3">
        <span className="block truncate text-sm text-gray-600">
          {contact.address || '-'}
        </span>
      </td>
      <td className="px-4 py-3">
        {contact.tag ? (
          <span
            className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: contact.tag.color + '20',
              color: contact.tag.color,
            }}
          >
            {contact.tag.name}
          </span>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {new Date(contact.created_at || '').toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-right">
        <div
          className="inline-flex gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onEdit}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Edit"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          <button
            onClick={onDelete}
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
  );
}
