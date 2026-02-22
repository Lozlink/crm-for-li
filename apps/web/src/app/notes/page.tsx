'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import NotesView from '@/components/NotesView';

export default function NotesPage() {
  return (
    <AuthGuard>
      <AppShell>
        <NotesView />
      </AppShell>
    </AuthGuard>
  );
}
