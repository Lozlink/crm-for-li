'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import ProspectingReports from '@/components/ProspectingReports';

export default function ProspectingPage() {
  return (
    <AuthGuard>
      <AppShell>
        <ProspectingReports />
      </AppShell>
    </AuthGuard>
  );
}
