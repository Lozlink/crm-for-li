'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import MapView from '@/components/MapView';

export default function MapPage() {
  return (
    <AuthGuard>
      <AppShell>
        <MapView />
      </AppShell>
    </AuthGuard>
  );
}
