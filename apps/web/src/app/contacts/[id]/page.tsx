'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import ContactDetail from '@/components/ContactDetail';

export default function ContactDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <AuthGuard>
      <AppShell>
        <ContactDetail contactId={params.id} />
      </AppShell>
    </AuthGuard>
  );
}
