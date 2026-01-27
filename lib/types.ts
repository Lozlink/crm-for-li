export interface Tag {
  id: string;
  name: string;
  color: string;
  user_id?: string;
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
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Activity {
  id: string;
  contact_id: string;
  type: 'note' | 'call' | 'meeting' | 'email';
  content?: string;
  user_id?: string;
  created_at?: string;
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
  initial_note?: string;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export interface PlaceDetails {
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

export const TAG_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#EAB308', // Yellow
  '#22C55E', // Green
  '#14B8A6', // Teal
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#6B7280', // Gray
  '#000000', // Black
];

export const ACTIVITY_TYPES = [
  { value: 'note', label: 'Note', icon: 'note-text' },
  { value: 'call', label: 'Call', icon: 'phone' },
  { value: 'meeting', label: 'Meeting', icon: 'account-group' },
  { value: 'email', label: 'Email', icon: 'email' },
] as const;
