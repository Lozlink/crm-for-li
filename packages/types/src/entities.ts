export interface Tag {
  id: string;
  name: string;
  color: string;
  user_id?: string;
  team_id?: string;
  created_at?: string;
}

export type ContactSource = 'referral' | 'web' | 'walk_in' | 'portal' | 'phone' | 'import';
export type ContactType = 'buyer' | 'seller' | 'tenant' | 'landlord' | 'investor' | 'other';
export type ContactStatus = 'active' | 'inactive' | 'archived';
export type PreferredContactMethod = 'phone' | 'email' | 'sms';

export interface Contact {
  id: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address?: string;
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

export interface Activity {
  id: string;
  contact_id: string;
  type: 'note' | 'call' | 'meeting' | 'email';
  content?: string;
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
  | 'house' | 'apartment' | 'townhouse' | 'land' | 'unit' | 'villa' | 'acreage' | 'block_of_units'
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
