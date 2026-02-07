'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import SettingsView from '@/components/SettingsView';

export default function SettingsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <SettingsView />
      </AppShell>
    </AuthGuard>
  );
}
