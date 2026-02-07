'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import Dashboard from '@/components/Dashboard';

export default function HomePage() {
  return (
    <AuthGuard>
      <AppShell>
        <Dashboard />
      </AppShell>
    </AuthGuard>
  );
}
