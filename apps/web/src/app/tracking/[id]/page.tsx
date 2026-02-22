'use client';

import { use } from 'react';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import TrackingDetail from '@/components/TrackingDetail';

export default function TrackingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <AppShell>
        <TrackingDetail sessionId={id} />
      </AppShell>
    </AuthGuard>
  );
}
