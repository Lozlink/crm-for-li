'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import StatsView from '@/components/StatsView';

export default function StatsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <StatsView />
      </AppShell>
    </AuthGuard>
  );
}
