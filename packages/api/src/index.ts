export { supabase, isDemoMode, generateUUID } from './supabase';
export { fetchSuburbBoundaries, fetchSuburbByName, fetchMultiDwellingBuildings } from './overpass';

// Auth
export {
  signUp,
  signIn,
  signOut,
  resetPassword,
  getSession,
  getProfile,
  updateProfile,
  onAuthStateChange,
} from './auth';

// Teams
export {
  createTeam,
  fetchUserTeams,
  fetchTeamMembers,
  updateMemberRole,
  removeMember,
  createInvitation,
  acceptInvitation,
  switchActiveTeam,
  updateTeam,
  deleteTeam,
  fetchTeamInvitations,
} from './teams';

// Directions
export { fetchOptimizedRoute, decodePolyline, encodePolyline } from './directions';
export type { DirectionsResult, DirectionsLeg } from './directions';

// Email
export { applyMergeFields } from './email';
export type { SendEmailParams, SendBulkEmailParams } from './email';

// Geocoding
export { reverseGeocode } from './geocoding';
export type { GeocodeResult } from './geocoding';

// Map deep-link builder
export { buildMapDeepLink } from './buildMapDeepLink';
export type { MapDeepLinkInput } from './buildMapDeepLink';

// Whiteboard photos
export { uploadWhiteboardPhotoBuffer, uploadWhiteboardPhotoFile } from './whiteboardPhotos';
