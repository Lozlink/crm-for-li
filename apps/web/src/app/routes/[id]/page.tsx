'use client';

import { use } from 'react';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import RouteDetail from '@/components/RouteDetail';

export default function RouteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <AppShell>
        <RouteDetail routeId={id} />
      </AppShell>
    </AuthGuard>
  );
}
