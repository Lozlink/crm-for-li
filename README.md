# Real Estate CRM - Monorepo

A cross-platform CRM system for real estate professionals built with React Native (Expo) and Next.js, organized as a Turborepo monorepo.

## 🏗️ Architecture

This project uses a **Turborepo monorepo** structure to share code between mobile and web platforms.

```
realestate-crm/
├── apps/
│   ├── mobile/          # React Native Expo app (iOS, Android)
│   └── web/             # Next.js web app (planned)
└── packages/
    ├── types/           # Shared TypeScript types
    ├── config/          # Shared constants and theme
    ├── utils/           # Platform detection & utilities
    ├── api/             # Supabase client & external APIs
    ├── hooks/           # React hooks & Zustand store
    └── ui/              # Shared UI components
```

## ✨ Features

### Mobile App (iOS/Android)
- **Map View**: Full-screen Google Maps centered on Greenfield Park, NSW with street-level zoom
- **Quick Property Add**: Long-press on map to drop pin, auto-fill address, add notes immediately
- **Contact Management**: Full CRUD with address autocomplete
- **Tag System**: Color-coded tags (e.g., "Hot Lead", "For Sale", "Not Interested")
- **Activity Feed**: Log notes, calls, meetings, emails per contact
- **Filtering**: Filter contacts by tags on both map and list views
- **Search**: Search contacts by name, email, or address
- **Contact Import**: Import from device contacts
- **Suburb Boundaries**: OpenStreetMap integration for suburb polygons

### Web App (Planned)
- Most features from mobile, with strategic limitations
- Leaflet maps instead of Google Maps
- No contact import or GPS features

## 📱 Platform Support

| Feature | Mobile (iOS/Android) | Web |
|---------|---------------------|-----|
| View/Create/Edit Contacts | ✅ | 🚧 Planned |
| Import Contacts from Device | ✅ | ❌ Not Available |
| Map View | ✅ Google Maps | 🚧 Leaflet (Planned) |
| Map Markers | ✅ | 🚧 Planned |
| User Location | ✅ | ❌ Not Available |
| Long Press Add | ✅ | ❌ Not Available |
| Address Autocomplete | ✅ | 🚧 Planned |
| Tags & Filtering | ✅ | 🚧 Planned |
| Activities & Notes | ✅ | 🚧 Planned |
| Suburb Boundaries | ✅ | 🚧 Planned |
| Supabase Sync | ✅ | 🚧 Planned |
| Demo Mode | ✅ | 🚧 Planned |

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0 (required for monorepo)
- For iOS: Xcode and CocoaPods
- For Android: Android Studio

### Installation

```bash
# Install pnpm if you don't have it
npm install -g pnpm

# Install all dependencies
pnpm install
```

### Environment Setup

Create `.env` file in the **project root** (not in apps/mobile):

```env
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=your-google-places-api-key
```

**Important:** The `.env` file must be in the monorepo root so all packages can access it.

**Demo Mode:** If Supabase credentials are not provided, the app runs in demo mode with local storage only.

### Development Commands

```bash
# Start mobile development server
pnpm mobile:start
# or
pnpm dev:mobile

# Run on iOS
pnpm mobile:ios

# Run on Android
pnpm mobile:android

# Type check all packages
pnpm type-check

# Type check mobile app only
pnpm type-check:mobile

# Clean build artifacts
pnpm clean

# Deep clean all node_modules
pnpm clean:deep
```

## 📦 Monorepo Packages

### `@realestate-crm/types`
Shared TypeScript interfaces and types.

**Exports:**
- `Contact`, `Tag`, `Activity`, `ContactFormData`
- `MapRegion`, `SavedSuburb`, `SuburbBoundary`
- `PlacePrediction`, `PlaceDetails`
- `TAG_COLORS`, `ACTIVITY_TYPES`

### `@realestate-crm/config`
Shared configuration and constants.

**Exports:**
- `TAG_COLORS`, `ACTIVITY_TYPES`
- `DEFAULT_MAP_REGION`
- `themeColors`, `spacing`, `borderRadius`

### `@realestate-crm/utils`
Platform detection and utilities.

**Exports:**
- **Platform:** `isWeb`, `isIOS`, `isAndroid`, `isMobile`
- **Features:** `features.hasNativeContacts`, `features.hasNativeLocation`, etc.
- **Storage:** `storage` (AsyncStorage wrapper for cross-platform)
- **Validation:** `isValidEmail`, `isValidPhone`, `isValidUrl`, etc.

### `@realestate-crm/api`
API clients for backend services.

**Exports:**
- `supabase` - Supabase client with storage abstraction
- `isDemoMode` - Demo mode detection flag
- `generateUUID` - UUID generator for demo mode
- `fetchSuburbBoundaries` - OpenStreetMap Overpass API
- `fetchSuburbByName` - Fetch specific suburb boundaries

### `@realestate-crm/hooks`
React hooks and global state.

**Exports:**
- `useCRMStore` - Zustand store with all CRM state and actions
  - Contacts, tags, activities, saved suburbs
  - CRUD operations for all entities
  - Demo mode support with local persistence

### `@realestate-crm/ui`
Shared UI components (React Native compatible).

**Exports:**
- `ContactCard`, `ContactForm`, `ContactPreview`
- `ActivityFeed`, `AddActivityDialog`
- `TagManager`, `TagPicker`
- `FilterSheet`, `MapSearchBar`
- `AddressAutocomplete`

## 🔨 Development Workflow

### Adding a Feature

1. **Determine where it belongs:**
   - Shared logic? → `packages/hooks` or `packages/utils`
   - API integration? → `packages/api`
   - UI component? → `packages/ui`
   - Mobile-specific? → `apps/mobile`

2. **Create/modify files:**
   ```bash
   # Example: New shared component
   packages/ui/src/MyComponent.tsx
   ```

3. **Export from package:**
   ```typescript
   // packages/ui/src/index.ts
   export { default as MyComponent } from './MyComponent';
   ```

4. **Use in app:**
   ```typescript
   // apps/mobile/app/some-screen.tsx
   import { MyComponent } from '@realestate-crm/ui';
   ```

### Import Patterns

```typescript
// Types
import type { Contact, Tag } from '@realestate-crm/types';

// Constants
import { TAG_COLORS, ACTIVITY_TYPES } from '@realestate-crm/config';

// Platform detection
import { isWeb, storage } from '@realestate-crm/utils';

// API
import { supabase, fetchSuburbBoundaries } from '@realestate-crm/api';

// Global state
import { useCRMStore } from '@realestate-crm/hooks';

// UI Components
import { ContactCard, TagPicker } from '@realestate-crm/ui';
```

## 🏗️ Building

```bash
# Build all apps
pnpm build

# Build mobile app only
pnpm build:mobile
```

## 🧪 Type Checking

```bash
# Type check all packages and apps
pnpm type-check

# Type check specific app
pnpm type-check:mobile
```

## 📚 External Services

### Supabase Setup
1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase/migrations/001_initial_schema.sql`
3. Copy URL and anon key to `.env`

### Google Maps Setup
1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable **Maps SDK for Android**, **Maps SDK for iOS**, **Places API**
3. Create an API key and add to `.env`

## 📖 Documentation

- [Migration Guide](./docs/MIGRATION.md) - Migrating from old structure to monorepo
- [Web Deployment Guide](./docs/WEB_DEPLOYMENT.md) - Deploying the web app (when available)

## 🛠️ Tech Stack

### Frontend
- **Mobile:** React Native, Expo SDK 54, expo-router
- **Web:** Next.js 14 (planned)
- **UI:** React Native Paper (Material Design 3)
- **Maps:** Google Maps (mobile), Leaflet (web, planned)

### Backend & State
- **Database:** Supabase (PostgreSQL)
- **State:** Zustand
- **Storage:** AsyncStorage (mobile), localStorage (web polyfill)

### Build & Tooling
- **Monorepo:** Turborepo
- **Package Manager:** pnpm workspaces
- **Language:** TypeScript
- **Linting:** Built into Expo

## 📄 License

Private project - All rights reserved.
