export interface Tag {
  id: string;
  name: string;
  color: string;
  user_id?: string;
  team_id?: string;
  created_at?: string;
}

export type ContactSource = 'referral' | 'web' | 'walk_in' | 'portal' | 'phone' | 'import' | 'other';
export type ContactType = 'buyer' | 'seller' | 'tenant' | 'landlord' | 'investor' | 'other';
export type ContactStatus = 'active' | 'inactive' | 'archived';
export type PreferredContactMethod = 'phone' | 'email' | 'sms' | 'other';

export interface Contact {
  id: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  unit_number?: string;
  latitude?: number;
  longitude?: number;
  tag_id?: string;
  tag?: Tag;
  tags?: Tag[];
  user_id?: string;
  team_id?: string;
  // Enrichment fields
  source?: ContactSource;
  contact_type?: ContactType;
  company_name?: string;
  title?: string;
  preferred_contact_method?: PreferredContactMethod;
  do_not_contact?: boolean;
  notes?: string;
  // Lifecycle fields
  status?: ContactStatus;
  lead_score?: number;
  last_contacted_at?: string;
  next_follow_up_at?: string;
  created_at?: string;
  updated_at?: string;
}

export type ActivitySource = 'office' | 'field' | 'call' | 'tracking' | 'inspection' | 'import';
export type CallOutcome = 'connected' | 'no_answer' | 'voicemail' | 'wrong_number' | 'busy';

export interface Activity {
  id: string;
  contact_id: string;
  type: 'note' | 'call' | 'meeting' | 'email' | 'sms';
  content?: string;
  source?: ActivitySource;
  call_outcome?: CallOutcome | null;
  tracking_annotation_id?: string;
  user_id?: string;
  team_id?: string;
  created_at?: string;
}

export interface ActivityWithContact extends Activity {
  contact: { first_name: string; last_name?: string };
}

export interface ContactFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  unit_number?: string;
  latitude?: number;
  longitude?: number;
  tag_id?: string;
  tag_ids?: string[];
  initial_note?: string;
  source?: ContactSource;
  contact_type?: ContactType;
  company_name?: string;
  title?: string;
  preferred_contact_method?: PreferredContactMethod;
  notes?: string;
}

export type RouteStatus = 'planned' | 'in_progress' | 'completed';
export type RouteMode = 'driving' | 'walking';
export type StopStatus = 'pending' | 'visited' | 'skipped';

export interface Route {
  id: string;
  name: string;
  status: RouteStatus;
  mode: RouteMode;
  estimated_duration_minutes?: number;
  polyline?: string;
  team_id?: string;
  user_id?: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
  stops?: RouteStop[];
}

export interface RouteStop {
  id: string;
  route_id: string;
  contact_id?: string;
  contact?: Contact;
  position: number;
  address?: string;
  latitude: number;
  longitude: number;
  status: StopStatus;
  estimated_arrival?: string;
  visited_at?: string;
  notes?: string;
  team_id?: string;
}

export interface StreetStats {
  streetName: string;
  suburb: string;
  contactCount: number;
  lastContactedAt: string | null;
  daysSinceLastContact: number | null;
  score: number;
  contacts: Contact[];
  averageLatitude: number;
  averageLongitude: number;
  opportunityScore?: number;
  salesMomentum?: number;
  penetrationPct?: number | null;
  conversionCount?: number;
}

// --- Smart Prospecting Engine ---

export type LeadTier = 'hot' | 'warm' | 'cold' | 'dormant';

export interface LeadScoreBreakdown {
  contactId: string;
  total: number; // 0-138 (core 100 + up to 8 building coverage + up to 30 inspection attendance)
  tier: LeadTier;
  components: {
    staleness: number;              // 0-25
    salesMomentum: number;          // 0-25
    engagement: number;             // 0-25
    streetConversion: number;       // 0-15
    penetration: number;            // 0-10
    buildingCoverage: number;       // 0-8 — bump for contacts in declared buildings the agent
                                    // has started canvassing but not finished. Trapezoidal:
                                    // full 8 when coverage_ratio ∈ [0.05, 0.95], 0 at the edges.
    inspectionAttendance: number;   // 0-30 — open-home attendance signal; see useLeadScoringEngine
  };
  lastComputedAt: string;
}

export interface TerritoryBriefing {
  suburb: string;
  medianSalePrice: number;
  avgDaysOnMarket: number;
  penetrationPct: number;
  contactCount: number;
  recentSales: number;
  recommendedAction: string;
}

export type ProspectingOutcome = 'no_answer' | 'voicemail' | 'interested' | 'not_interested' | 'callback_requested';

export interface GuidedStop {
  contactId: string;
  address: string;
  latitude: number;
  longitude: number;
  scoreBreakdown: LeadScoreBreakdown;
  routePosition: number;
  distanceFromPrev: number;
  status: 'pending' | 'visited' | 'skipped';
  outcome?: ProspectingOutcome;
  visitedAt?: string;
}

// --- Activity Tracking ---

export interface TrackingSession {
  id: string;
  user_id?: string;
  team_id?: string;
  status: 'active' | 'completed';
  started_at: string;
  completed_at?: string;
  total_distance_meters?: number;
  duration_seconds?: number;
  polyline?: string;
  created_at?: string;
}

export interface TrackingBreadcrumb {
  id: string;
  session_id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  recorded_at: string;
}

export interface TrackingAnnotation {
  id: string;
  session_id: string;
  latitude: number;
  longitude: number;
  note: string;
  contact_id?: string;
  contact?: Contact;
  user_id?: string;
  team_id?: string;
  created_at?: string;
  updated_at?: string;
}

// --- Properties ---

export type PropertyType = 'residential' | 'commercial';

export type PropertyCategory =
  | 'house' | 'apartment' | 'townhouse' | 'land' | 'unit' | 'villa' | 'acreage' | 'block_of_units' | 'other'
  | 'commercial_office' | 'commercial_retail' | 'commercial_industrial' | 'commercial_other';

export type PropertyForType = 'sale' | 'lease';

export type PropertyStatus = 'appraisal' | 'available' | 'under_offer' | 'exchanged' | 'settled' | 'leased' | 'withdrawn';

export type PropertyContactRole = 'vendor' | 'buyer' | 'tenant' | 'landlord' | 'solicitor';

export interface Property {
  id: string;
  team_id?: string;
  user_id?: string;
  address: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  latitude?: number;
  longitude?: number;
  property_type: PropertyType;
  category: PropertyCategory;
  for_type: PropertyForType;
  status: PropertyStatus;
  appraisal_price?: number;
  advertised_price?: number;
  sale_price?: number;
  commission_percent?: number;
  beds?: number;
  baths?: number;
  cars?: number;
  land_size_sqm?: number;
  building_size_sqm?: number;
  features: string[];
  photos: string[];
  description?: string;
  assigned_agents: string[];
  listed_at?: string;
  exchanged_at?: string;
  settled_at?: string;
  created_at?: string;
  updated_at?: string;
  // Joined relations
  property_contacts?: PropertyContact[];
}

export interface PropertyContact {
  id: string;
  property_id: string;
  contact_id: string;
  role: PropertyContactRole;
  created_at?: string;
  // Joined
  contact?: Contact;
}

export interface PropertyFormData {
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  latitude?: number;
  longitude?: number;
  property_type: PropertyType;
  category: PropertyCategory;
  for_type: PropertyForType;
  appraisal_price?: number;
  advertised_price?: number;
  commission_percent?: number;
  beds?: number;
  baths?: number;
  cars?: number;
  land_size_sqm?: number;
  building_size_sqm?: number;
  features: string[];
  description?: string;
}

// --- Buyer Matching ---

export interface ContactRequirement {
  id: string;
  contact_id: string;
  team_id?: string;
  for_type: 'buy' | 'rent';
  property_types: string[];
  categories: string[];
  suburbs: string[];
  price_min?: number;
  price_max?: number;
  beds_min?: number;
  baths_min?: number;
  cars_min?: number;
  land_size_min?: number;
  building_size_min?: number;
  features: string[];
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type MatchStrength = 'strong' | 'partial' | 'weak';

export interface BuyerMatch {
  contact: Contact;
  requirement: ContactRequirement;
  strength: MatchStrength;
  matchingFields: string[];
}

// --- Inspections ---

export type InspectionType = 'open_home' | 'private';
export type InspectionStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type AttendeeSource = 'walk_in' | 'registered' | 'invited';
export type InterestLevel = 'hot' | 'warm' | 'cold';

export interface Inspection {
  id: string;
  property_id: string;
  team_id?: string;
  agent_id?: string;
  scheduled_at: string;
  duration_minutes: number;
  type: InspectionType;
  status: InspectionStatus;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  // Joined
  property?: Property;
  attendees?: InspectionAttendee[];
}

export interface InspectionAttendee {
  id: string;
  inspection_id: string;
  contact_id?: string;
  first_name: string;
  last_name?: string;
  phone?: string;
  email?: string;
  source: AttendeeSource;
  feedback?: string;
  interest_level?: InterestLevel;
  created_at?: string;
  // Joined
  contact?: Contact;
  /**
   * Transient — only set on the `addAttendee` return value; never persisted to the database.
   * True when the attendee has contact info (phone/email) but no exact CRM match was found,
   * prompting the UI to offer a "did you mean?" contact-link flow.
   */
  suggestedContactMatch?: boolean;
}

// --- Tasks ---

export type TaskType = 'task' | 'appointment' | 'follow_up' | 'inspection_reminder';
export type TaskStatus = 'pending' | 'completed' | 'overdue';
export type TaskPriority = 'low' | 'normal' | 'high';

export interface Task {
  id: string;
  team_id?: string;
  title: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  due_at?: string;
  completed_at?: string;
  priority: TaskPriority;
  assigned_to?: string;
  contact_id?: string;
  property_id?: string;
  inspection_id?: string;
  created_at?: string;
  updated_at?: string;
  // Joined
  contact?: Contact;
  property?: Property;
}

// --- Saved Searches ---

export interface SavedSearch {
  id: string;
  name: string;
  entity_type: 'contact' | 'property';
  filters: Record<string, unknown>;
  user_id?: string;
  team_id?: string;
  is_shared: boolean;
  created_at?: string;
  updated_at?: string;
}

// --- Email Campaigns ---

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent';
export type RecipientStatus = 'pending' | 'sent' | 'delivered' | 'opened' | 'bounced' | 'unsubscribed';

export interface EmailCampaign {
  id: string;
  team_id?: string;
  name: string;
  subject: string;
  body_html?: string;
  body_text?: string;
  status: CampaignStatus;
  scheduled_at?: string;
  sent_at?: string;
  sender_id?: string;
  created_at?: string;
  updated_at?: string;
  // Derived
  recipient_count?: number;
  sent_count?: number;
  opened_count?: number;
}

export interface EmailRecipient {
  id: string;
  campaign_id: string;
  contact_id?: string;
  email: string;
  status: RecipientStatus;
  sent_at?: string;
  opened_at?: string;
  contact?: Contact;
}

export interface ContactSubscription {
  id: string;
  contact_id: string;
  team_id?: string;
  subscribed: boolean;
  unsubscribed_at?: string;
  unsubscribe_reason?: string;
  created_at?: string;
  updated_at?: string;
}

// --- Custom Fields ---
export type CustomFieldType = 'text' | 'number' | 'boolean' | 'date' | 'single_select' | 'multi_select';
export type CustomFieldEntityType = 'contact' | 'property' | 'contact_requirement' | 'inspection' | 'task';

export interface CustomFieldDefinition {
  id: string;
  team_id: string;
  entity_type: CustomFieldEntityType;
  field_name: string;
  field_label: string;
  field_type: CustomFieldType;
  options?: string[];
  is_required?: boolean;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CustomFieldValue {
  id: string;
  definition_id: string;
  entity_id: string;
  entity_type: CustomFieldEntityType;
  value_text?: string;
  value_number?: number;
  value_boolean?: boolean;
  value_date?: string;
  value_json?: unknown;
  team_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface CustomFieldWithValue {
  definition: CustomFieldDefinition;
  value: CustomFieldValue | null;
}

// --- Sold History (NSW Valuer General) ---

export interface SoldRecord {
  id: string;
  address: string;
  suburb: string;
  postcode?: string;
  state?: string;
  property_type?: string;
  sale_price?: number;
  sale_date?: string;
  settlement_date?: string;
  area_sqm?: number;
  latitude?: number;
  longitude?: number;
  source?: string;
  team_id?: string;
  created_at?: string;
}

// --- SMS Campaigns ---

export type SmsCampaignStatus = 'draft' | 'sending' | 'sent' | 'failed';
export type SmsMessageStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';

export interface SmsCampaign {
  id: string;
  name: string;
  message_template: string;
  status: SmsCampaignStatus;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  scheduled_at?: string;
  sent_at?: string;
  user_id?: string;
  team_id?: string;
  created_at?: string;
}

export interface SmsMessage {
  id: string;
  campaign_id: string;
  contact_id?: string;
  phone_number: string;
  message_body: string;
  status: SmsMessageStatus;
  sent_at?: string;
  delivered_at?: string;
  error_message?: string;
  user_id?: string;
  team_id?: string;
  created_at?: string;
}

export interface SmsOptOut {
  id: string;
  phone_number: string;
  opted_out_at: string;
  team_id?: string;
}

/**
 * SMS labels are sibling entities to templates — categorical context tags
 * (e.g. "Open Home", "Follow-up", "Market Update") that templates can be
 * tagged with via the sms_template_labels junction. Many-to-many.
 */
export interface SmsLabel {
  id: string;
  team_id: string | null;
  name: string;
  color: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsTemplate {
  id: string;
  team_id: string | null;
  name: string;
  message: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Resolved labels for this template, populated by the store via the junction. */
  labels?: SmsLabel[];
}

/**
 * Suggested seed labels surfaced by the UI as quick picks for a new team.
 * Teams can rename, delete, or add their own — this is just the starter set.
 */
export const SMS_LABEL_SEEDS: { name: string; color: string }[] = [
  { name: 'General', color: '#6366F1' },
  { name: 'Open Home', color: '#F59E0B' },
  { name: 'Follow-up', color: '#10B981' },
  { name: 'Cold Outreach', color: '#3B82F6' },
  { name: 'Market Update', color: '#8B5CF6' },
  { name: 'Appointment', color: '#06B6D4' },
  { name: 'Listing Update', color: '#EF4444' },
  { name: 'Seasonal', color: '#EC4899' },
];

// --- Declared Buildings ---

export interface DeclaredBuilding {
  id: string;
  team_id: string | null;
  address: string;
  latitude: number;
  longitude: number;
  estimated_units: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// --- Whiteboard Items ---

export type WhiteboardItemType =
  | 'sticky'
  | 'checklist'
  | 'photo'
  | 'contact'
  | 'property'
  | 'map'
  | 'goal'
  | 'suggestion';

export interface WhiteboardChecklistEntry {
  id: string;
  text: string;
  checked: boolean;
}

export interface WhiteboardStickyContent {
  text: string;
}

export interface WhiteboardChecklistContent {
  title?: string;
  items: WhiteboardChecklistEntry[];
}

export interface WhiteboardPhotoContent {
  url: string;
  caption?: string;
  // Local URI used while upload is pending; cleared once `url` is finalized.
  local_uri?: string;
}

// Phase 2 — live-bound widgets. These store a snapshot for offline rendering
// plus a ref_id at the row level so the renderer can re-fetch the live entity.

export interface WhiteboardContactContent {
  contactId: string;
  /** Snapshot for offline rendering — refreshed each time the live entity is read. */
  snapshotName?: string;
  snapshotScore?: number;
}

export interface WhiteboardPropertyContent {
  propertyId: string;
  snapshotAddress?: string;
}

export interface WhiteboardMapContent {
  viewport: { lat: number; lng: number; zoom: number };
  /** Optional overlays to render on the embedded thumbnail. */
  overlays?: ('buildings' | 'tracking' | 'sold')[];
  /** Resolved via OSM Nominatim reverse-geocode; cached on the row after first lookup. */
  address?: string;
  suburb?: string;
}

export type WhiteboardGoalMetric = 'commission' | 'listings' | 'leads' | 'calls';
export type WhiteboardGoalPeriod = 'month' | 'quarter';

export interface WhiteboardGoalContent {
  metric: WhiteboardGoalMetric;
  target: number;
  period: WhiteboardGoalPeriod;
  /** ISO timestamp; renderer derives "days remaining". */
  deadlineIso?: string;
  /** Optional cached current value — renderer can override by querying activities. */
  current?: number;
}

/**
 * Suggestion content stored on a board (Intelligence-derived).
 *
 * Field names align with the SmartSuggestion shape in
 * `@realestate-crm/hooks/useSmartSuggestions`. The `body` field is the
 * UI-friendly label for what the hook calls `subtitle` — projection happens
 * at "Add to board" time in the whiteboard route.
 */
export type WhiteboardSuggestionKind =
  | 'hot_prospects'
  | 'coverage_gap'
  | 'today_play'
  | 'route';

export interface WhiteboardSuggestionContent {
  kind: WhiteboardSuggestionKind;
  title: string;
  body: string;
  /** Links back to the originating SmartSuggestion.id for dedup guard. */
  suggestion_id?: string;
  /** Free-form payload preserving the original SmartSuggestion.payload for deep links. */
  payload?: Record<string, unknown>;
}

export type WhiteboardItemContent =
  | WhiteboardStickyContent
  | WhiteboardChecklistContent
  | WhiteboardPhotoContent
  | WhiteboardContactContent
  | WhiteboardPropertyContent
  | WhiteboardMapContent
  | WhiteboardGoalContent
  | WhiteboardSuggestionContent;

export interface WhiteboardItem {
  id: string;
  team_id: string | null;
  type: WhiteboardItemType;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  z_index: number;
  content: WhiteboardItemContent;
  color: string | null;
  /** Live-bound widgets (contact / property) populate this with the linked entity id. */
  ref_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// --- Suburb Statistics (abs Census) ---

export interface SuburbStats {
  id: string;
  suburb: string;
  state?: string;
  postcode?: string;
  total_dwellings?: number;
  separate_houses?: number;
  semi_detached?: number;
  flats_units?: number;
  other_dwellings?: number;
  population?: number;
  median_household_income?: number;
  median_age?: number;
  median_sale_price?: number;
  median_rent_weekly?: number;
  avg_days_on_market?: number;
  latitude?: number;
  longitude?: number;
  census_year?: number;
  source?: string;
}
