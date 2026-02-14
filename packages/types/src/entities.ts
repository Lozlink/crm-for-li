export interface Tag {
  id: string;
  name: string;
  color: string;
  user_id?: string;
  team_id?: string;
  created_at?: string;
}

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
