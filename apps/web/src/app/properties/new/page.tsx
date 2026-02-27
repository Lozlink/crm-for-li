'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import NewProperty from '@/components/NewProperty';

export default function NewPropertyPage() {
  return (
    <AuthGuard>
      <AppShell>
        <NewProperty />
      </AppShell>
    </AuthGuard>
  );
}
