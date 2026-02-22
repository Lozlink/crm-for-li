'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import TrackingList from '@/components/TrackingList';

export default function TrackingPage() {
  return (
    <AuthGuard>
      <AppShell>
        <TrackingList />
      </AppShell>
    </AuthGuard>
  );
}
