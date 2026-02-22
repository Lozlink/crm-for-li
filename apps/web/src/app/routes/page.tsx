'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import RoutesTable from '@/components/RoutesTable';

export default function RoutesPage() {
  return (
    <AuthGuard>
      <AppShell>
        <RoutesTable />
      </AppShell>
    </AuthGuard>
  );
}
