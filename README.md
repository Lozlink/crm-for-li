# Real Estate CRM - Mobile App

A mobile-first CRM application with Google Maps integration for managing real estate contacts and properties.

## Features

- **Map View**: Full-screen Google Maps with clustered contact markers
- **Contact Management**: Add, edit, and delete contacts with address autocomplete
- **Tag System**: Color-coded tags for organizing contacts
- **Activity Feed**: Log notes, calls, meetings, and emails per contact
- **Filtering**: Filter contacts by tags on both map and list views
- **Search**: Search contacts by name, email, or address

## Tech Stack

- React Native + Expo SDK 52
- Expo Router (file-based routing)
- react-native-maps + react-native-map-clustering
- Google Places API (address autocomplete)
- Supabase (auth, database, realtime)
- Zustand (state management)
- React Native Paper (Material Design 3)

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (macOS) or Android Emulator

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Configure your environment variables in `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=your-google-places-api-key
```

### External Services Setup

#### Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase/migrations/001_initial_schema.sql` via the SQL Editor
3. Copy your project URL and anon key to `.env`

#### Google Maps
1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable **Maps SDK for Android**, **Maps SDK for iOS**, and **Places API**
3. Create an API key and add it to `.env` and `app.json`

### Running the App

```bash
# Start development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

## Demo Mode

The app works without Supabase configuration using local storage. This is useful for testing the UI and basic functionality without setting up a backend.

## Project Structure

```
├── app/                    # Expo Router screens
│   ├── (tabs)/
│   │   ├── index.tsx       # Map view (home)
│   │   ├── contacts.tsx    # Contact list
│   │   └── settings.tsx    # Settings/tags management
│   ├── contact/
│   │   ├── [id].tsx        # Contact details
│   │   └── new.tsx         # Add contact
│   └── _layout.tsx         # Root layout
├── components/
│   ├── ContactCard.tsx     # Contact list item
│   ├── ContactForm.tsx     # Add/edit form
│   ├── ContactPreview.tsx  # Map marker preview
│   ├── TagPicker.tsx       # Tag selection
│   ├── TagManager.tsx      # Create/edit tags
│   ├── FilterSheet.tsx     # Bottom sheet for filtering
│   ├── AddressAutocomplete.tsx
│   ├── ActivityFeed.tsx    # Activity timeline
│   └── AddActivityDialog.tsx
├── lib/
│   ├── supabase.ts         # Supabase client
│   ├── store.ts            # Zustand store
│   └── types.ts            # TypeScript types
└── supabase/
    └── migrations/         # Database schema
```

## License

MIT
