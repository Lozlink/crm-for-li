'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import ContactsTable from '@/components/ContactsTable';

export default function ContactsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <ContactsTable />
      </AppShell>
    </AuthGuard>
  );
}
