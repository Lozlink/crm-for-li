'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import PipelineBoard from '@/components/PipelineBoard';

export default function PipelinePage() {
  return (
    <AuthGuard>
      <AppShell>
        <PipelineBoard />
      </AppShell>
    </AuthGuard>
  );
}
