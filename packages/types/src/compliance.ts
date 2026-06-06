// --- IntelliCompli Compliance Types ---
// AUSTRAC-focused AML/CTF compliance suite. These types mirror the IntelliCompli
// REST API contract (Stripe-style, cus_* / alt_* prefixed IDs) and are shared
// across mobile, web, and the compliance store.

export type ComplianceRiskLevel = 'low' | 'medium' | 'high';
export type ComplianceAlertSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type ComplianceAlertStatus =
  | 'new'
  | 'acknowledged'
  | 'investigating'
  | 'escalated'
  | 'resolved'
  | 'dismissed'
  | 'false_positive';
export type ComplianceVerificationStatus = 'unverified' | 'pending' | 'verified';
export type ComplianceScreeningKind = 'sanctions' | 'pep';

export interface ComplianceProfile {
  customerId: string;        // IntelliCompli cus_* id
  contactId: string;         // CRM contact id
  riskScore: number;         // 0-100
  riskLevel: ComplianceRiskLevel;
  isPep: boolean;
  isSanctioned: boolean;
  verificationStatus: ComplianceVerificationStatus;
  cddStatus: string;         // e.g. 'standard_cdd' | 'enhanced_cdd'
  cddLevel: 'standard' | 'enhanced';
  lastScreenedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceScreeningMatch {
  name: string;
  details: string;
  matchScore: number;
}

export interface ComplianceScreeningResult {
  kind: ComplianceScreeningKind;
  matchCount: number;
  matches: ComplianceScreeningMatch[];
  screenedAt: string;
}

export interface ComplianceAlert {
  id: string;
  alertNumber: string;       // e.g. ALT-20260425-0007
  ruleCode: string;          // 'PEP_DETECTION' | 'STRUCTURING_DETECTED' | future codes
  title: string;
  description: string;
  severity: ComplianceAlertSeverity;
  status: ComplianceAlertStatus;
  customerId: string | null;
  slaDeadline: string | null;
  slaBreached: boolean;
  isEscalated: boolean;
  resolutionType: string | null;
  resolutionNotes: string | null;
  triggerData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceAnalytics {
  customers: {
    total: number;
    verified: number;
    pending: number;
    sanctioned: number;
    pep: number;
    verificationRate: number;
  };
  riskDistribution: { low: number; medium: number; high: number };
  alerts: { open: number; critical: number; slaBreached: number; slaWarning: number };
  cases: { open: number; pending: number };
  ocdd: { dueThisWeek: number; overdue: number };
  screenings: { total: number; matches: number };
}
