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
