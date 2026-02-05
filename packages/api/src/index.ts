export { supabase, isDemoMode, generateUUID } from './supabase';
export { fetchSuburbBoundaries, fetchSuburbByName } from './overpass';

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
