'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import { useCRMStore } from '@realestate-crm/hooks';
import { findDuplicates } from '@realestate-crm/utils';
import type { Contact } from '@realestate-crm/types';

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

type CRMField = 'first_name' | 'last_name' | 'phone' | 'email' | 'address' | '__skip';

const FIELD_ALIASES: Record<Exclude<CRMField, '__skip'>, string[]> = {
  first_name: ['first_name', 'firstname', 'first name', 'fname', 'given name'],
  last_name: ['last_name', 'lastname', 'last name', 'surname', 'family name', 'lname'],
  phone: ['phone', 'mobile', 'tel', 'telephone', 'cell', 'phone number', 'mobile number'],
  email: ['email', 'e-mail', 'email address', 'emailaddress'],
  address: ['address', 'street', 'full address', 'location', 'street address'],
};

const CRM_FIELDS: { value: CRMField; label: string }[] = [
  { value: '__skip', label: '-- Skip --' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'address', label: 'Address' },
];

function autoDetectField(header: string): CRMField {
  const normalized = header.toLowerCase().trim();
  // Check for single "name" column handled separately
  if (normalized === 'name' || normalized === 'full name' || normalized === 'fullname') {
    return 'first_name'; // Will be split later
  }
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(normalized)) return field as CRMField;
  }
  return '__skip';
}

interface CSVImportProps {
  onClose: () => void;
}

export default function CSVImport({ onClose }: CSVImportProps) {
  const existingContacts = useCRMStore((s) => s.contacts);
  const bulkAddContacts = useCRMStore((s) => s.bulkAddContacts);

  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, CRMField>>({});
  const [hasNameColumn, setHasNameColumn] = useState(false);

  // Preview state
  const [mappedContacts, setMappedContacts] = useState<Omit<Contact, 'id' | 'created_at' | 'updated_at'>[]>([]);
  const [dupeMap, setDupeMap] = useState<Map<number, Contact>>(new Map());
  const [skipIndices, setSkipIndices] = useState<Set<number>>(new Set());
  const [errorIndices, setErrorIndices] = useState<Set<number>>(new Set());

  // Results
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const [parseError, setParseError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setParseError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setParseError('Failed to parse CSV: ' + results.errors[0].message);
          return;
        }
        const headers = results.meta.fields || [];
        const rows = results.data as Record<string, string>[];

        setCsvHeaders(headers);
        setCsvRows(rows);

        // Auto-detect column mapping
        const mapping: Record<string, CRMField> = {};
        let nameCol = false;
        for (const h of headers) {
          const norm = h.toLowerCase().trim();
          if (norm === 'name' || norm === 'full name' || norm === 'fullname') {
            mapping[h] = 'first_name';
            nameCol = true;
          } else {
            mapping[h] = autoDetectField(h);
          }
        }
        setColumnMapping(mapping);
        setHasNameColumn(nameCol);
        setStep('mapping');
      },
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
        handleFile(file);
      } else {
        setParseError('Please upload a .csv file');
      }
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // Build preview from mapping
  const previewRows = useMemo(() => {
    return csvRows.slice(0, 5).map((row) => {
      const result: Record<string, string> = {};
      for (const [csvCol, crmField] of Object.entries(columnMapping)) {
        if (crmField === '__skip') continue;
        const val = row[csvCol]?.trim() || '';
        if (crmField === 'first_name' && hasNameColumn) {
          const parts = val.split(/\s+/);
          result.first_name = parts[0] || '';
          result.last_name = parts.slice(1).join(' ') || '';
        } else if (result[crmField]) {
          // Don't overwrite if already set
        } else {
          result[crmField] = val;
        }
      }
      return result;
    });
  }, [csvRows, columnMapping, hasNameColumn]);

  const handleProceedToPreview = useCallback(() => {
    const contacts: Omit<Contact, 'id' | 'created_at' | 'updated_at'>[] = csvRows.map((row) => {
      const c: any = {};
      for (const [csvCol, crmField] of Object.entries(columnMapping)) {
        if (crmField === '__skip') continue;
        const val = row[csvCol]?.trim() || '';
        if (crmField === 'first_name' && hasNameColumn) {
          const parts = val.split(/\s+/);
          c.first_name = parts[0] || '';
          if (!c.last_name) c.last_name = parts.slice(1).join(' ') || '';
        } else if (!c[crmField]) {
          c[crmField] = val;
        }
      }
      if (!c.first_name) c.first_name = '';
      return c;
    });

    setMappedContacts(contacts);

    // Find duplicates
    const dupes = findDuplicates(
      contacts.map((c) => ({
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone,
      })),
      existingContacts
    );
    setDupeMap(dupes);

    // Mark dupes as skipped by default, flag missing first_name as errors
    const skip = new Set(dupes.keys());
    const errors = new Set<number>();
    contacts.forEach((c, i) => {
      if (!c.first_name) {
        errors.add(i);
        skip.add(i);
      }
    });
    setSkipIndices(skip);
    setErrorIndices(errors);
    setStep('preview');
  }, [csvRows, columnMapping, hasNameColumn, existingContacts]);

  const toggleSkip = useCallback((idx: number) => {
    if (errorIndices.has(idx)) return; // Can't include error rows
    setSkipIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, [errorIndices]);

  const handleImport = useCallback(async () => {
    setStep('importing');
    const toImport = mappedContacts.filter((_, i) => !skipIndices.has(i));
    const created = await bulkAddContacts(toImport);
    setImportedCount(created.length);
    setSkippedCount(skipIndices.size - errorIndices.size);
    setErrorCount(errorIndices.size);
    setStep('done');
  }, [mappedContacts, skipIndices, errorIndices, bulkAddContacts]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative mx-4 max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Import CSV</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(85vh-64px)] overflow-y-auto p-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
                dragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <svg className="mb-4 h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="mb-2 text-sm text-gray-600">
                Drag and drop a CSV file here, or
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                Choose File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
              />
              {parseError && (
                <p className="mt-4 text-sm text-red-500">{parseError}</p>
              )}
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && (
            <div>
              <p className="mb-4 text-sm text-gray-500">
                Found {csvRows.length} rows. Map CSV columns to CRM fields:
              </p>

              <div className="mb-6 space-y-3">
                {csvHeaders.map((header) => (
                  <div key={header} className="flex items-center gap-4">
                    <span className="w-40 truncate text-sm font-medium text-gray-700">
                      {header}
                    </span>
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                    <select
                      value={columnMapping[header] || '__skip'}
                      onChange={(e) =>
                        setColumnMapping((prev) => ({
                          ...prev,
                          [header]: e.target.value as CRMField,
                        }))
                      }
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      {CRM_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview table */}
              {previewRows.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-gray-400">
                    Preview (first 5 rows)
                  </p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          {['First Name', 'Last Name', 'Phone', 'Email', 'Address'].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2">{row.first_name || '-'}</td>
                            <td className="px-3 py-2">{row.last_name || '-'}</td>
                            <td className="px-3 py-2">{row.phone || '-'}</td>
                            <td className="px-3 py-2">{row.email || '-'}</td>
                            <td className="px-3 py-2">{row.address || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setStep('upload')}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleProceedToPreview}
                  className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Dedup Preview */}
          {step === 'preview' && (
            <div>
              <p className="mb-4 text-sm text-gray-500">
                {mappedContacts.length - skipIndices.size} will be imported,{' '}
                {skipIndices.size - errorIndices.size} duplicates skipped,{' '}
                {errorIndices.size} errors
              </p>

              <div className="max-h-96 overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50">
                      <th className="w-10 px-3 py-2" />
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Phone</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Email</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedContacts.map((c, i) => {
                      const isDupe = dupeMap.has(i);
                      const isError = errorIndices.has(i);
                      const isSkipped = skipIndices.has(i);
                      const dupeOf = dupeMap.get(i);
                      return (
                        <tr key={i} className={`border-t ${isError ? 'bg-red-50' : isSkipped ? 'bg-gray-50' : ''}`}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={!isSkipped}
                              disabled={isError}
                              onChange={() => toggleSkip(i)}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {c.first_name} {c.last_name || ''}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{c.phone || '-'}</td>
                          <td className="px-3 py-2 text-gray-500">{c.email || '-'}</td>
                          <td className="px-3 py-2">
                            {isError ? (
                              <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                                Missing name
                              </span>
                            ) : isDupe ? (
                              <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                                Duplicate of {dupeOf?.first_name}
                              </span>
                            ) : (
                              <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-600">
                                New
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setStep('mapping')}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={mappedContacts.length - skipIndices.size === 0}
                  className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  Import {mappedContacts.length - skipIndices.size} Contacts
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center py-12">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-primary-500" />
              <p className="text-sm text-gray-600">Importing contacts...</p>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center py-12">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">Import Complete</h3>
              <p className="text-sm text-gray-600">
                Imported {importedCount}, Skipped {skippedCount}
                {errorCount > 0 && `, ${errorCount} errors`}
              </p>
              <button
                onClick={onClose}
                className="mt-6 rounded-lg bg-primary-500 px-6 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
