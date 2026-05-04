'use client';

import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import WhiteboardView from '@/components/WhiteboardView';

/**
 * /whiteboard — Smart Whiteboard page.
 *
 * Wrapped in AuthGuard (redirects to /auth if not signed in)
 * and AppShell (sidebar nav + team switcher).
 *
 * The whiteboard canvas fills the remaining viewport height after the top bar.
 */
export default function WhiteboardPage() {
  return (
    <AuthGuard>
      <AppShell>
        <div className="flex h-full flex-col">
          <WhiteboardView />
        </div>
      </AppShell>
    </AuthGuard>
  );
}
