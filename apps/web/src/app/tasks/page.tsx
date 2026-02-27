'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import TasksView from '@/components/TasksView';

export default function TasksPage() {
  return (
    <AuthGuard>
      <AppShell>
        <TasksView />
      </AppShell>
    </AuthGuard>
  );
}
