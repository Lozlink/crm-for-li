'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import NewRoute from '@/components/NewRoute';

export default function NewRoutePage() {
  return (
    <AuthGuard>
      <AppShell>
        <NewRoute />
      </AppShell>
    </AuthGuard>
  );
}
