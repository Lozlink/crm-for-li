'use client';

import { use } from 'react';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import PropertyDetail from '@/components/PropertyDetail';

export default function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <AppShell>
        <PropertyDetail propertyId={id} />
      </AppShell>
    </AuthGuard>
  );
}
