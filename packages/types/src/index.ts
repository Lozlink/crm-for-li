// Entities
export type {
  Tag, Contact, Activity, ActivityWithContact, ContactFormData,
  ContactSource, ContactType, ContactStatus, PreferredContactMethod,
  ActivitySource, CallOutcome,
} from './entities';
export type { Route, RouteStop, RouteStatus, RouteMode, StopStatus, StreetStats } from './entities';
export type { TrackingSession, TrackingBreadcrumb, TrackingAnnotation } from './entities';
export type {
  Property, PropertyContact, PropertyFormData,
  PropertyType, PropertyCategory, PropertyForType, PropertyStatus, PropertyContactRole,
} from './entities';
export type {
  ContactRequirement, MatchStrength, BuyerMatch,
} from './entities';
export type {
  Inspection, InspectionAttendee,
  InspectionType, InspectionStatus, AttendeeSource, InterestLevel,
} from './entities';
export type {
  Task, TaskType, TaskStatus, TaskPriority,
} from './entities';
export type { SavedSearch } from './entities';
export type {
  EmailCampaign, EmailRecipient, ContactSubscription,
  CampaignStatus, RecipientStatus,
} from './entities';
export type {
  CustomFieldType, CustomFieldEntityType,
  CustomFieldDefinition, CustomFieldValue, CustomFieldWithValue,
} from './entities';
export type { SoldRecord, SuburbStats } from './entities';
export type {
  LeadTier, LeadScoreBreakdown, TerritoryBriefing,
  ProspectingOutcome, GuidedStop,
} from './entities';
export type {
  SmsCampaign, SmsMessage, SmsOptOut,
  SmsCampaignStatus, SmsMessageStatus,
} from './entities';

// Map types
export type { MapRegion, SavedSuburb, SuburbBoundary, OSMBuilding } from './map';

// Google Places types
export type { PlacePrediction, PlaceDetails, PlaceAddressComponent } from './google-places';

// Auth & Teams
export type {
  TeamRole,
  MembershipStatus,
  TeamPlan,
  TeamStatus,
  UserProfile,
  Team,
  Membership,
  Invitation,
  OrgRole,
  Organisation,
  OrganisationMembership,
} from './auth';

// Permissions
export type { Permission } from './permissions';
export { ROLE_HIERARCHY, ROLE_PERMISSIONS, hasRole, hasPermission } from './permissions';

// Constants
export { TAG_COLORS, ACTIVITY_TYPES } from './constants';
