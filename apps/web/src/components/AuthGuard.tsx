'use client';

import { useAuthStore } from '@realestate-crm/hooks';
import AuthPage from '@/app/auth/AuthPage';
import TeamSetup from './TeamSetup';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const isLoading = useAuthStore((s) => s.isLoading);
  const memberships = useAuthStore((s) => s.memberships);
  const activeTeam = useAuthStore((s) => s.activeTeam);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated && !isDemoMode) {
    return <AuthPage />;
  }

  // Authenticated but no team — show team creation / join flow
  if (isAuthenticated && !isDemoMode && memberships.length === 0 && !activeTeam) {
    return <TeamSetup />;
  }

  return <>{children}</>;
}
