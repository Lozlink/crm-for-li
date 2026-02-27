'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import PropertiesTable from '@/components/PropertiesTable';

export default function PropertiesPage() {
  return (
    <AuthGuard>
      <AppShell>
        <PropertiesTable />
      </AppShell>
    </AuthGuard>
  );
}
