/**
 * IntelliCompli REST client — AUSTRAC-focused AML/CTF compliance suite.
 *
 * Base URL: https://api.intellicompli.com.au (override via INTELLICOMPLI_API_URL).
 * Auth: Authorization: Bearer <JWT or API key>.
 *
 * When INTELLICOMPLI_API_URL / INTELLICOMPLI_API_KEY are absent the module falls
 * through to an in-memory mock transport that mirrors the real API behaviour
 * (cursor pagination, state mutations, seeded AU data) so every UI flow is fully
 * testable without the network.
 *
 * To enable the real transport:
 *  1. Set INTELLICOMPLI_API_URL + INTELLICOMPLI_API_KEY in app.config.ts extra / .env.
 *  2. Add NEXT_PUBLIC_INTELLICOMPLI_API_URL / NEXT_PUBLIC_INTELLICOMPLI_API_KEY for web.
 *  3. `isIntelliCompliConfigured()` flips to true and the real transport activates.
 */

import Constants from 'expo-constants';
import type {
  ComplianceProfile,
  ComplianceAlert,
  ComplianceAlertStatus,
  ComplianceAnalytics,
  ComplianceScreeningKind,
  ComplianceScreeningResult,
  ComplianceScreeningMatch,
} from '@realestate-crm/types';

// ---------------------------------------------------------------------------
// Config — mirrors how packages/api/src/supabase.ts reads Expo extra fields
// ---------------------------------------------------------------------------

// Runtime credential overrides — set via setIntelliCompliCredentials().
//
// _runtimeApiKey: null = no runtime override; getConfig() falls through to env/Expo config.
//                 non-null string = runtime key ('' is a valid non-null key that yields no key).
// _forceMock: when true, getConfig() returns no API key regardless of env/Expo config or
//             _runtimeApiKey. Set by clearIntelliCompliCredentials() and by
//             loadSuitePreference when the new team has no stored key.
//             Cleared by setIntelliCompliCredentials() so a new key re-enables live mode.
//
// This two-variable approach is explicit and grep-verifiable (finding 5):
//   grep -n "_forceMock" packages/api/src/intellicompli.ts
let _runtimeApiKey: string | null = null;
let _runtimeApiUrl: string | null = null;
let _forceMock = false;

function getConfig() {
  const extra = Constants.expoConfig?.extra ?? {};
  return {
    // URL: runtime override wins; fall back to env var; then hard-coded live default.
    apiUrl: _runtimeApiUrl !== null
      ? _runtimeApiUrl
      : (extra.INTELLICOMPLI_API_URL as string | undefined) || 'https://api.intellicompli.com.au',
    // Key: _forceMock suppresses everything → empty string → MockTransport.
    // Otherwise: runtime override wins over env/Expo config.
    apiKey: _forceMock
      ? ''
      : _runtimeApiKey !== null
        ? _runtimeApiKey
        : (extra.INTELLICOMPLI_API_KEY as string | undefined) || '',
  };
}

/** True when an API key is configured (env, Expo config, or runtime override). */
export function isIntelliCompliConfigured(): boolean {
  const { apiKey } = getConfig();
  return apiKey.length > 0;
}

/**
 * Returns 'live' when an API key is configured (real HttpTransport will be used),
 * 'mock' otherwise (in-memory mock transport).
 */
export function getIntelliCompliMode(): 'live' | 'mock' {
  return isIntelliCompliConfigured() ? 'live' : 'mock';
}

/**
 * Inject credentials at runtime without an app restart.
 * Clears _forceMock so the key takes effect even after a prior Clear.
 * Resets the transport singleton so the next call picks up the new HttpTransport.
 *
 * @param key  API key (Bearer token).
 * @param url  Optional base URL override — useful for staging environments.
 *             Omit to keep the current URL config.
 */
export function setIntelliCompliCredentials(key: string, url?: string): void {
  _runtimeApiKey = key.trim();
  _forceMock = false; // explicit key always wins over any prior force-mock
  if (url !== undefined) _runtimeApiUrl = url.trim();
  resetIntelliCompliTransport();
}

/**
 * Force mock transport, even if INTELLICOMPLI_API_KEY is baked into the build.
 * Sets _forceMock=true so getConfig() returns no key regardless of env vars.
 * Called by the store on: explicit user Clear, team switch with no stored key.
 */
export function clearIntelliCompliCredentials(): void {
  _runtimeApiKey = null;
  _runtimeApiUrl = null;
  _forceMock = true;
  resetIntelliCompliTransport();
}

/**
 * @deprecated Use setIntelliCompliCredentials(key) instead.
 * Kept for backwards compatibility with the compliance store's loadSuitePreference.
 */
export function setRuntimeApiKey(key: string): void {
  setIntelliCompliCredentials(key);
}

// ---------------------------------------------------------------------------
// Endpoint map — verified against the live OpenAPI spec at api.intellicompli.com.au
// ---------------------------------------------------------------------------
// NOTE: There is no GET /v1/customers/{id} endpoint. Profile lookups by customer
// ID must use GET /v1/customers?email=<email> and match on id. The owner controls
// both APIs and may add GET /v1/customers/{id} in a future release.

const ENDPOINTS = {
  customers:          '/v1/customers',                       // GET (list) · POST (create)
  screenSanctions:    '/v1/sanctions/screen',                // POST
  screenPep:          '/v1/pep/screen',                      // POST
  riskAssessment:     '/v1/risk/assess',                     // POST
  alerts:             '/v1/alerts',                          // GET (list)
  alert:              (id: string) => `/v1/alerts/${id}`,   // PATCH
  analytics:          '/v1/analytics/overview',              // GET
};

// ---------------------------------------------------------------------------
// Transport interface — allows the real HTTP transport and mock to be swapped
// ---------------------------------------------------------------------------

interface Transport {
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
}

// ---------------------------------------------------------------------------
// Real HTTP transport
// ---------------------------------------------------------------------------

class HttpTransport implements Transport {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`IntelliCompli ${method} ${path} failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  }
}

// ---------------------------------------------------------------------------
// Mock transport — module-level state; mutations persist within the session
// ---------------------------------------------------------------------------

// Seed timestamps relative to now so dates look realistic in the partner demo.
const _now = new Date();
const _yesterday = new Date(_now.getTime() - 86400000);
const _lastWeek = new Date(_now.getTime() - 7 * 86400000);
const _tomorrow = new Date(_now.getTime() + 86400000);
const _nextWeek = new Date(_now.getTime() + 7 * 86400000);

function iso(d: Date): string { return d.toISOString(); }

// Seeded mock customers — 6 contacts, AU addresses, varying risk profiles.
interface MockCustomer {
  id: string;
  object: 'customer';
  customerType: 'individual';
  externalId: string | null;
  email: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  dateOfBirth: string;
  address: { line1: string; city: string; state: string; postcode: string; country: string };
  phone: string;
  verificationStatus: 'unverified' | 'pending' | 'verified';
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  isPep: boolean;
  isSanctioned: boolean;
  lastScreenedAt: string | null;
  cddStatus: 'standard_cdd' | 'enhanced_cdd';
  cddLevel: 'standard' | 'enhanced';
  relationshipStatus: 'active';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const _mockCustomers: MockCustomer[] = [
  {
    id: 'cus_mock_001', object: 'customer', customerType: 'individual', externalId: null,
    email: 'david.jones@example.com', firstName: 'David', middleName: null, lastName: 'Jones',
    dateOfBirth: '1965-03-15',
    address: { line1: '12 Macquarie Street', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
    phone: '+61 2 9000 0001',
    verificationStatus: 'verified', riskScore: 95, riskLevel: 'high',
    isPep: true, isSanctioned: true, lastScreenedAt: iso(_yesterday),
    cddStatus: 'enhanced_cdd', cddLevel: 'enhanced',
    relationshipStatus: 'active', metadata: {},
    createdAt: iso(_lastWeek), updatedAt: iso(_yesterday),
  },
  {
    id: 'cus_mock_002', object: 'customer', customerType: 'individual', externalId: null,
    email: 'sarah.chen@example.com', firstName: 'Sarah', middleName: null, lastName: 'Chen',
    dateOfBirth: '1980-07-22',
    address: { line1: '88 Collins Street', city: 'Melbourne', state: 'VIC', postcode: '3000', country: 'AU' },
    phone: '+61 3 9000 0002',
    verificationStatus: 'verified', riskScore: 55, riskLevel: 'medium',
    isPep: false, isSanctioned: false, lastScreenedAt: iso(_yesterday),
    cddStatus: 'standard_cdd', cddLevel: 'standard',
    relationshipStatus: 'active', metadata: {},
    createdAt: iso(_lastWeek), updatedAt: iso(_yesterday),
  },
  {
    id: 'cus_mock_003', object: 'customer', customerType: 'individual', externalId: null,
    email: 'james.wilson@example.com', firstName: 'James', middleName: null, lastName: 'Wilson',
    dateOfBirth: '1975-11-08',
    address: { line1: '5 Queen Street', city: 'Brisbane', state: 'QLD', postcode: '4000', country: 'AU' },
    phone: '+61 7 9000 0003',
    verificationStatus: 'pending', riskScore: 25, riskLevel: 'low',
    isPep: false, isSanctioned: false, lastScreenedAt: null,
    cddStatus: 'standard_cdd', cddLevel: 'standard',
    relationshipStatus: 'active', metadata: {},
    createdAt: iso(_lastWeek), updatedAt: iso(_lastWeek),
  },
  {
    id: 'cus_mock_004', object: 'customer', customerType: 'individual', externalId: null,
    email: 'emily.zhang@example.com', firstName: 'Emily', middleName: null, lastName: 'Zhang',
    dateOfBirth: '1990-04-30',
    address: { line1: '200 St Georges Terrace', city: 'Perth', state: 'WA', postcode: '6000', country: 'AU' },
    phone: '+61 8 9000 0004',
    verificationStatus: 'verified', riskScore: 12, riskLevel: 'low',
    isPep: false, isSanctioned: false, lastScreenedAt: iso(_lastWeek),
    cddStatus: 'standard_cdd', cddLevel: 'standard',
    relationshipStatus: 'active', metadata: {},
    createdAt: iso(_lastWeek), updatedAt: iso(_lastWeek),
  },
  {
    id: 'cus_mock_005', object: 'customer', customerType: 'individual', externalId: null,
    email: 'michael.taylor@example.com', firstName: 'Michael', middleName: null, lastName: 'Taylor',
    dateOfBirth: '1985-09-14',
    address: { line1: '1 King William Street', city: 'Adelaide', state: 'SA', postcode: '5000', country: 'AU' },
    phone: '+61 8 9000 0005',
    verificationStatus: 'unverified', riskScore: 18, riskLevel: 'low',
    isPep: false, isSanctioned: false, lastScreenedAt: null,
    cddStatus: 'standard_cdd', cddLevel: 'standard',
    relationshipStatus: 'active', metadata: {},
    createdAt: iso(_now), updatedAt: iso(_now),
  },
  {
    id: 'cus_mock_006', object: 'customer', customerType: 'individual', externalId: null,
    email: 'lisa.nguyen@example.com', firstName: 'Lisa', middleName: null, lastName: 'Nguyen',
    dateOfBirth: '1978-12-05',
    address: { line1: '10 Murray Street', city: 'Hobart', state: 'TAS', postcode: '7000', country: 'AU' },
    phone: '+61 3 9000 0006',
    verificationStatus: 'verified', riskScore: 8, riskLevel: 'low',
    isPep: false, isSanctioned: false, lastScreenedAt: iso(_lastWeek),
    cddStatus: 'standard_cdd', cddLevel: 'standard',
    relationshipStatus: 'active', metadata: {},
    createdAt: iso(_lastWeek), updatedAt: iso(_lastWeek),
  },
];

// Seeded mock alerts — 4 alerts spanning both rule codes and statuses.
interface MockAlert {
  id: string;
  object: 'alert';
  alertNumber: string;
  ruleCode: string;
  title: string;
  description: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  status: 'new' | 'acknowledged' | 'investigating' | 'escalated' | 'resolved' | 'dismissed' | 'false_positive';
  customerId: string | null;
  triggerData: Record<string, unknown>;
  slaDeadline: string | null;
  slaBreached: boolean;
  isEscalated: boolean;
  resolutionType: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

const _mockAlerts: MockAlert[] = [
  {
    id: 'alt_mock_001', object: 'alert',
    alertNumber: 'ALT-20260606-0001',
    ruleCode: 'STRUCTURING_DETECTED',
    title: 'Structuring pattern detected — suspicious cash transactions',
    description: 'Multiple transactions totalling $24,182.60 show structuring indicators. AUSTRAC reporting obligation may apply.',
    severity: 'critical', status: 'new', customerId: 'cus_mock_002',
    triggerData: {
      indicators: ['multiple_cash_deposits', 'below_threshold_pattern', 'same_day_series'],
      totalAmount: 24182.6,
      transactionCount: 9,
    },
    slaDeadline: iso(_tomorrow),
    slaBreached: true, isEscalated: false,
    resolutionType: null, resolutionNotes: null,
    createdAt: iso(_yesterday), updatedAt: iso(_yesterday),
  },
  {
    id: 'alt_mock_002', object: 'alert',
    alertNumber: 'ALT-20260606-0002',
    ruleCode: 'PEP_DETECTION',
    title: 'PEP detected: David Jones',
    description: 'Foreign Politically Exposed Person identified — mandatory Enhanced Due Diligence (EDD) required under AUSTRAC guidelines.',
    severity: 'high', status: 'new', customerId: 'cus_mock_001',
    triggerData: {
      pepName: 'David Jones',
      position: 'Former Minister of Finance',
      matchScore: 1,
      pepCategory: 'foreign',
      country: 'gb',
    },
    slaDeadline: iso(_nextWeek),
    slaBreached: false, isEscalated: false,
    resolutionType: null, resolutionNotes: null,
    createdAt: iso(_yesterday), updatedAt: iso(_yesterday),
  },
  {
    id: 'alt_mock_003', object: 'alert',
    alertNumber: 'ALT-20260530-0003',
    ruleCode: 'STRUCTURING_DETECTED',
    title: 'Structuring pattern detected — resolved',
    description: 'Prior structuring alert reviewed; funds verified as legitimate property settlement proceeds.',
    severity: 'high', status: 'resolved', customerId: 'cus_mock_003',
    triggerData: {
      indicators: ['rapid_succession_deposits'],
      totalAmount: 18500.0,
      transactionCount: 4,
    },
    slaDeadline: iso(new Date(_now.getTime() - 2 * 86400000)),
    slaBreached: false, isEscalated: false,
    resolutionType: 'resolved', resolutionNotes: 'Funds traced to property settlement. No suspicious matter report required.',
    createdAt: iso(new Date(_now.getTime() - 10 * 86400000)),
    updatedAt: iso(new Date(_now.getTime() - 2 * 86400000)),
  },
  {
    id: 'alt_mock_004', object: 'alert',
    alertNumber: 'ALT-20260529-0004',
    ruleCode: 'PEP_DETECTION',
    title: 'PEP detected: dismissed — false positive',
    description: 'Name match on sanctions list; upon review confirmed as a different individual with similar name.',
    severity: 'high', status: 'false_positive', customerId: 'cus_mock_004',
    triggerData: {
      pepName: 'Emily Zhang',
      position: 'Government Official',
      matchScore: 0.72,
      pepCategory: 'domestic',
      country: 'au',
    },
    slaDeadline: null,
    slaBreached: false, isEscalated: false,
    resolutionType: 'false_positive', resolutionNotes: 'Confirmed different individual. DOB and address do not match watchlist entry.',
    createdAt: iso(new Date(_now.getTime() - 8 * 86400000)),
    updatedAt: iso(new Date(_now.getTime() - 6 * 86400000)),
  },
];

// Seeded watchlist — one match so the partner can demo a screening hit.
const MOCK_WATCHLIST_NAMES = ['David Jones'];

let _mockScreeningCount = 14;
let _mockScreeningMatchCount = 2;

function _mockScreeningMatchCount_bump(matched: boolean) {
  _mockScreeningCount++;
  if (matched) _mockScreeningMatchCount++;
}

class MockTransport implements Transport {
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    // Simulate a small async delay so loading states are exercised.
    await new Promise<void>(resolve => setTimeout(resolve, 120));

    // Route dispatch — paths are hardcoded here so mock routing is immune to
    // ENDPOINTS map changes (which only affect the real HttpTransport).
    if (method === 'POST' && path === '/v1/customers') {
      return this._createCustomer(body as Record<string, unknown>) as unknown as T;
    }
    if (method === 'GET' && path.startsWith('/v1/customers')) {
      return this._listCustomers(path) as unknown as T;
    }
    if (method === 'POST' && path === '/v1/sanctions/screen') {
      return this._screen(body as Record<string, unknown>, 'sanctions') as unknown as T;
    }
    if (method === 'POST' && path === '/v1/pep/screen') {
      return this._screen(body as Record<string, unknown>, 'pep') as unknown as T;
    }
    if (method === 'POST' && path === '/v1/risk/assess') {
      const customerId = ((body as Record<string, unknown>).customerId as string | undefined) ?? '';
      return this._riskAssessment(customerId) as unknown as T;
    }
    if (method === 'GET' && path.startsWith('/v1/alerts')) {
      return this._listAlerts() as unknown as T;
    }
    if (method === 'PATCH' && path.startsWith('/v1/alerts/')) {
      const id = path.split('/')[3];
      return this._updateAlert(id, body as Record<string, unknown>) as unknown as T;
    }
    if (method === 'GET' && path === '/v1/analytics/overview') {
      return this._getAnalytics() as unknown as T;
    }

    throw new Error(`MockTransport: unhandled ${method} ${path}`);
  }

  private _createCustomer(body: Record<string, unknown>): MockCustomer {
    // Mirror the live API's strictness: dateOfBirth lands in a Postgres `date`
    // column, where '' fails with 22007. The mock previously accepted '' —
    // which is exactly how the empty-string payload bug reached production.
    if (body.dateOfBirth === '') {
      throw new Error(
        'IntelliCompli API error 500: invalid input syntax for type date: "" ' +
        '(omit dateOfBirth instead of sending an empty string)',
      );
    }
    const id = `cus_mock_${String(Date.now()).slice(-6)}`;
    const customer: MockCustomer = {
      id, object: 'customer', customerType: 'individual',
      externalId: (body.externalId as string | null) ?? null,
      email: (body.email as string) ?? '',
      firstName: (body.firstName as string) ?? '',
      middleName: null,
      lastName: (body.lastName as string) ?? '',
      dateOfBirth: (body.dateOfBirth as string) ?? '',
      address: (body.address as MockCustomer['address']) ?? { line1: '', city: '', state: '', postcode: '', country: 'AU' },
      phone: (body.phone as string) ?? '',
      verificationStatus: 'unverified',
      riskScore: 0, riskLevel: 'low',
      isPep: false, isSanctioned: false, lastScreenedAt: null,
      cddStatus: 'standard_cdd', cddLevel: 'standard',
      relationshipStatus: 'active', metadata: {},
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    _mockCustomers.push(customer);
    return customer;
  }

  private _listCustomers(path: string): { object: 'list'; data: MockCustomer[]; hasMore: boolean; totalCount: number } {
    // Support ?email= filter so getComplianceCustomer (which has no single-GET endpoint) works.
    let data = [..._mockCustomers];
    const qs = path.includes('?') ? new URLSearchParams(path.split('?')[1]) : null;
    const emailFilter = qs?.get('email');
    if (emailFilter) {
      data = data.filter(c => c.email.toLowerCase() === emailFilter.toLowerCase());
    }
    return { object: 'list', data, hasMore: false, totalCount: data.length };
  }

  private _riskAssessment(customerId: string): MockCustomer {
    const c = _mockCustomers.find(x => x.id === customerId);
    if (!c) throw new Error(`Customer ${customerId} not found`);
    // Trigger score recalculation based on PEP/sanctions flags in mock
    c.riskScore = c.isPep ? 95 : c.isSanctioned ? 85 : c.riskScore;
    c.riskLevel = c.riskScore >= 70 ? 'high' : c.riskScore >= 40 ? 'medium' : 'low';
    c.updatedAt = new Date().toISOString();
    return c;
  }

  private _screen(body: Record<string, unknown>, kind: 'sanctions' | 'pep'): {
    object: 'screening';
    customerId: string;
    kind: string;
    matchCount: number;
    matches: Array<{ name: string; details: string; matchScore: number }>;
    screenedAt: string;
  } {
    const screenedAt = new Date().toISOString();
    const firstName = (body.firstName as string) ?? '';
    const lastName = (body.lastName as string) ?? '';
    const fullName = `${firstName} ${lastName}`.trim();

    // Return a match only if the name is in the seeded watchlist (case-insensitive).
    const isHit = MOCK_WATCHLIST_NAMES.some(
      n => n.toLowerCase() === fullName.toLowerCase(),
    );

    const matches: Array<{ name: string; details: string; matchScore: number }> = isHit
      ? [{ name: fullName, details: `Watchlist hit — ${kind === 'pep' ? 'Foreign PEP, former Minister of Finance (GB)' : 'OFAC SDN list match'}`, matchScore: 1 }]
      : [];

    _mockScreeningMatchCount_bump(isHit);

    // Update lastScreenedAt on the customer if externalId or customerId provided
    const customerId = (body.customerId as string | undefined) ?? '';
    const byExtId = (body.externalId as string | undefined) ?? '';
    const c = _mockCustomers.find(x => x.id === customerId || x.externalId === byExtId);
    if (c) {
      c.lastScreenedAt = screenedAt;
      c.updatedAt = screenedAt;
      if (isHit && kind === 'pep') c.isPep = true;
      if (isHit && kind === 'sanctions') c.isSanctioned = true;
      c.riskLevel = (c.isPep || c.isSanctioned) ? 'high' : c.riskLevel;
      c.riskScore = (c.isPep || c.isSanctioned) ? 95 : c.riskScore;
    }

    return { object: 'screening', customerId, kind, matchCount: matches.length, matches, screenedAt };
  }

  private _listAlerts(): { object: 'list'; data: MockAlert[]; hasMore: boolean; totalCount: number } {
    return { object: 'list', data: [..._mockAlerts], hasMore: false, totalCount: _mockAlerts.length };
  }

  private _updateAlert(id: string, body: Record<string, unknown>): MockAlert {
    const idx = _mockAlerts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Alert ${id} not found`);
    const updated: MockAlert = {
      ..._mockAlerts[idx],
      ...(body as Partial<MockAlert>),
      updatedAt: new Date().toISOString(),
    };
    _mockAlerts[idx] = updated;
    return updated;
  }

  private _getAnalytics(): ComplianceAnalytics {
    const verified = _mockCustomers.filter(c => c.verificationStatus === 'verified').length;
    const pending = _mockCustomers.filter(c => c.verificationStatus === 'pending').length;
    const sanctioned = _mockCustomers.filter(c => c.isSanctioned).length;
    const pep = _mockCustomers.filter(c => c.isPep).length;
    const total = _mockCustomers.length;
    return {
      customers: {
        total, verified, pending, sanctioned, pep,
        verificationRate: total > 0 ? verified / total : 0,
      },
      riskDistribution: {
        low: _mockCustomers.filter(c => c.riskLevel === 'low').length,
        medium: _mockCustomers.filter(c => c.riskLevel === 'medium').length,
        high: _mockCustomers.filter(c => c.riskLevel === 'high').length,
      },
      alerts: {
        open: _mockAlerts.filter(a => a.status === 'new' || a.status === 'investigating' || a.status === 'acknowledged').length,
        critical: _mockAlerts.filter(a => a.severity === 'critical').length,
        slaBreached: _mockAlerts.filter(a => a.slaBreached).length,
        slaWarning: _mockAlerts.filter(a => !a.slaBreached && a.slaDeadline !== null && new Date(a.slaDeadline).getTime() - Date.now() < 48 * 3600 * 1000).length,
      },
      cases: { open: 1, pending: 1 },
      ocdd: { dueThisWeek: 2, overdue: 1 },
      screenings: { total: _mockScreeningCount, matches: _mockScreeningMatchCount },
    };
  }
}

// ---------------------------------------------------------------------------
// Transport singleton — real or mock depending on config
// ---------------------------------------------------------------------------

let _transport: Transport | null = null;

function getTransport(): Transport {
  // Finding 4: discard a stale singleton if credentials changed since it was created.
  if (_transport && _transportCreatedAtGeneration === _transportGeneration) {
    return _transport;
  }
  const { apiUrl, apiKey } = getConfig();
  // Real transport requires an API key; base URL always resolves to the live default.
  _transport = apiKey
    ? new HttpTransport(apiUrl, apiKey)
    : new MockTransport();
  _transportCreatedAtGeneration = _transportGeneration;
  return _transport;
}

// Finding 4: transport-generation race guard.
// A monotonic generation counter is bumped every time credentials change.
// getTransport() stores the generation at which the singleton was created and
// discards it if the stored generation is stale — preventing any in-progress
// call from handing back a transport that belongs to a prior credential set.
let _transportGeneration = 0;
let _transportCreatedAtGeneration = -1;

// Reset transport singleton (useful for tests / config changes at runtime)
export function resetIntelliCompliTransport(): void {
  _transportGeneration++;
  _transport = null;
  _transportCreatedAtGeneration = -1;
}

// ---------------------------------------------------------------------------
// Raw API shapes (camelCase, as returned by the IntelliCompli platform)
// ---------------------------------------------------------------------------

interface ApiCustomer {
  id: string;
  externalId: string | null;
  verificationStatus: 'unverified' | 'pending' | 'verified';
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  isPep: boolean;
  isSanctioned: boolean;
  lastScreenedAt: string | null;
  cddStatus: string;
  cddLevel: 'standard' | 'enhanced';
  createdAt: string;
  updatedAt: string;
}

interface ApiAlert {
  id: string;
  alertNumber: string;
  ruleCode: string;
  title: string;
  description: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  status: 'new' | 'acknowledged' | 'investigating' | 'escalated' | 'resolved' | 'dismissed' | 'false_positive';
  customerId: string | null;
  triggerData: Record<string, unknown>;
  slaDeadline: string | null;
  slaBreached: boolean;
  isEscalated: boolean;
  resolutionType: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiScreeningResult {
  customerId: string;
  kind: string;
  matchCount: number;
  matches: Array<{ name: string; details: string; matchScore: number }>;
  screenedAt: string;
}

interface ApiListEnvelope<T> { object: 'list'; data: T[]; hasMore: boolean; totalCount: number }

// ---------------------------------------------------------------------------
// Mappers — raw API JSON → contract types
// ---------------------------------------------------------------------------

function mapCustomerToProfile(raw: ApiCustomer, contactId: string): ComplianceProfile {
  return {
    customerId: raw.id,
    contactId,
    riskScore: raw.riskScore,
    riskLevel: raw.riskLevel,
    isPep: raw.isPep,
    isSanctioned: raw.isSanctioned,
    verificationStatus: raw.verificationStatus,
    cddStatus: raw.cddStatus,
    cddLevel: raw.cddLevel,
    lastScreenedAt: raw.lastScreenedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function mapAlert(raw: ApiAlert): ComplianceAlert {
  return {
    id: raw.id,
    alertNumber: raw.alertNumber,
    ruleCode: raw.ruleCode,
    title: raw.title,
    description: raw.description,
    severity: raw.severity,
    status: raw.status,
    customerId: raw.customerId,
    slaDeadline: raw.slaDeadline,
    slaBreached: raw.slaBreached,
    isEscalated: raw.isEscalated,
    resolutionType: raw.resolutionType,
    resolutionNotes: raw.resolutionNotes,
    triggerData: raw.triggerData,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function mapScreeningResult(raw: ApiScreeningResult, kind: ComplianceScreeningKind): ComplianceScreeningResult {
  const matches: ComplianceScreeningMatch[] = raw.matches.map(m => ({
    name: m.name,
    details: m.details,
    matchScore: m.matchScore,
  }));
  return { kind, matchCount: raw.matchCount, matches, screenedAt: raw.screenedAt };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Input for creating an IntelliCompli customer from a CRM contact. */
export interface CreateComplianceCustomerInput {
  contactId: string;
  firstName: string;
  lastName?: string;
  /** Required by the IntelliCompli API. `createComplianceCustomer` throws if absent. */
  email: string;
  phone?: string;
  dateOfBirth?: string;
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

/**
 * Error thrown when a compliance operation cannot proceed due to missing contact data.
 * The UI should surface the `message` directly to the agent.
 */
export class ComplianceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComplianceValidationError';
  }
}

/** Create an IntelliCompli customer record linked to a CRM contact. */
export async function createComplianceCustomer(input: CreateComplianceCustomerInput): Promise<ComplianceProfile> {
  // Email is required by the IntelliCompli API — surface a clear error so the UI
  // can prompt the agent to add one before enabling the compliance suite.
  if (!input.email || input.email.trim() === '') {
    throw new ComplianceValidationError(
      'Add an email address to enable compliance for this contact.',
    );
  }

  // Optional fields must be OMITTED when empty, never sent as ''. The live API
  // inserts dateOfBirth into a Postgres `date` column — an empty string passes
  // API validation but fails the insert with 22007 ("invalid input syntax for
  // type date"), surfacing to us as an opaque 500. `undefined` keys are dropped
  // by JSON.stringify, so conditional spreads are the safe shape here.
  const phone = input.phone?.trim();
  const dateOfBirth = input.dateOfBirth?.trim();
  const addressFields = {
    ...(input.address?.line1 ? { line1: input.address.line1 } : {}),
    ...(input.address?.city ? { city: input.address.city } : {}),
    ...(input.address?.state ? { state: input.address.state } : {}),
    ...(input.address?.postcode ? { postcode: input.address.postcode } : {}),
  };
  const hasAddress = Object.keys(addressFields).length > 0;

  const raw = await getTransport().request<ApiCustomer>('POST', ENDPOINTS.customers, {
    customerType: 'individual',
    externalId: input.contactId,
    firstName: input.firstName,
    lastName: input.lastName ?? '',
    email: input.email.trim(),
    ...(phone ? { phone } : {}),
    ...(dateOfBirth ? { dateOfBirth } : {}),
    // Only send an address when the contact actually has one — a bag of empty
    // strings with a defaulted country is noise in the compliance record.
    ...(hasAddress ? { address: { ...addressFields, country: input.address?.country ?? 'AU' } } : {}),
  });
  return mapCustomerToProfile(raw, input.contactId);
}

/**
 * Fetch a compliance profile for a contact.
 *
 * NOTE: The IntelliCompli API has no GET /v1/customers/{id} endpoint (as of the
 * current spec). We work around this by listing customers filtered by email and
 * matching on customerId. The owner controls both APIs and may add a direct GET
 * endpoint in a future release — when that happens, replace this with a single
 * GET /v1/customers/{customerId} call.
 */
export async function getComplianceCustomer(
  customerId: string,
  contactId: string,
  contactEmail?: string,
): Promise<ComplianceProfile> {
  // Finding 1 (complete fix): when contactEmail is absent we cannot scope the list
  // call safely — an unfiltered GET /v1/customers returns all customers and matching
  // on id alone is ambiguous if the page doesn't include this id. Throw a typed error
  // so the caller can surface "re-enable compliance" rather than silently misattribute
  // another contact's PEP/sanctions record.
  if (!contactEmail) {
    throw new ComplianceValidationError(
      'Cannot refresh compliance profile: contact has no email address. ' +
      'Add an email and re-enable compliance for this contact.',
    );
  }

  const envelope = await getTransport().request<ApiListEnvelope<ApiCustomer>>(
    'GET',
    `${ENDPOINTS.customers}?email=${encodeURIComponent(contactEmail)}`,
  );
  // Never fall back to data[0] — that could be a different customer's record.
  const raw = envelope.data.find(c => c.id === customerId);
  if (!raw) {
    throw new Error(`IntelliCompli customer ${customerId} not found`);
  }
  return mapCustomerToProfile(raw, contactId);
}

/** Input for screening a customer against a watchlist. */
export interface ScreenCustomerInput {
  customerId: string;
  contactId: string;
  firstName: string;
  lastName?: string;
  dateOfBirth?: string;
}

/** Run a sanctions or PEP screening. */
export async function screenCustomer(
  input: ScreenCustomerInput,
  kind: ComplianceScreeningKind,
): Promise<ComplianceScreeningResult> {
  let raw: ApiScreeningResult;

  if (kind === 'sanctions') {
    // POST /v1/sanctions/screen — body: { firstName (req), lastName (req), country?, dateOfBirth? }
    // dateOfBirth omitted when absent — '' fails Postgres date columns downstream
    // (same 22007 failure mode as customer create).
    const dateOfBirth = input.dateOfBirth?.trim();
    raw = await getTransport().request<ApiScreeningResult>('POST', ENDPOINTS.screenSanctions, {
      firstName: input.firstName,
      lastName: input.lastName ?? '',
      ...(dateOfBirth ? { dateOfBirth } : {}),
      country: 'AU',
    });
  } else {
    // POST /v1/pep/screen — body: { customerId?, firstName?, lastName?, fullName? }
    raw = await getTransport().request<ApiScreeningResult>('POST', ENDPOINTS.screenPep, {
      customerId: input.customerId,
      firstName: input.firstName,
      lastName: input.lastName ?? '',
      fullName: [input.firstName, input.lastName].filter(Boolean).join(' '),
    });
  }

  return mapScreeningResult(raw, kind);
}

/** Trigger risk re-assessment for a customer. Returns the updated profile. */
export async function assessCustomerRisk(customerId: string, contactId: string): Promise<ComplianceProfile> {
  // POST /v1/risk/assess — body: { customerId (req), transactionAmount?, transactionCurrency? }
  const raw = await getTransport().request<ApiCustomer>('POST', ENDPOINTS.riskAssessment, {
    customerId,
  });
  return mapCustomerToProfile(raw, contactId);
}

/** Filters accepted by the list-alerts endpoint. */
export interface ListComplianceAlertsFilters {
  status?: ComplianceAlertStatus;
  /** Maps to query param `customer_id` per spec. */
  customerId?: string;
  startingAfter?: string;
  limit?: number;
}

/** Fetch the alerts list. */
export async function listComplianceAlerts(filters?: ListComplianceAlertsFilters): Promise<ComplianceAlert[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.customerId) params.set('customer_id', filters.customerId);
  if (filters?.startingAfter) params.set('starting_after', filters.startingAfter);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const path = qs ? `${ENDPOINTS.alerts}?${qs}` : ENDPOINTS.alerts;
  const envelope = await getTransport().request<ApiListEnvelope<ApiAlert>>('GET', path);
  return envelope.data.map(mapAlert);
}

/**
 * Partial update body for an alert (PATCH /v1/alerts/{id}).
 * Accepted props per spec: status, resolutionType, resolutionNotes,
 * investigationNotes, assignedTo, metadata.
 */
export interface UpdateComplianceAlertBody {
  status?: ComplianceAlertStatus;
  resolutionType?: string;
  resolutionNotes?: string;
  /** Used for escalations — the spec has no separate escalationReason field. */
  investigationNotes?: string;
  assignedTo?: string;
}

/** Update alert status, resolution, or escalation. */
export async function updateComplianceAlert(
  alertId: string,
  body: UpdateComplianceAlertBody,
): Promise<ComplianceAlert> {
  const raw = await getTransport().request<ApiAlert>('PATCH', ENDPOINTS.alert(alertId), body);
  return mapAlert(raw);
}

/** Fetch aggregate compliance analytics from GET /v1/analytics/overview. */
export async function getComplianceAnalytics(): Promise<ComplianceAnalytics> {
  return getTransport().request<ComplianceAnalytics>('GET', ENDPOINTS.analytics);
}
