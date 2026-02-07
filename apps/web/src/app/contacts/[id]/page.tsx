'use client';

import { use } from 'react';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import ContactDetail from '@/components/ContactDetail';

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <AppShell>
        <ContactDetail contactId={id} />
      </AppShell>
    </AuthGuard>
  );
}
