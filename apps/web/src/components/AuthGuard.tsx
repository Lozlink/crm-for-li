'use client';

import { useAuthStore } from '@realestate-crm/hooks';
import AuthPage from '@/app/auth/AuthPage';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const isLoading = useAuthStore((s) => s.isLoading);

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

  return <>{children}</>;
}
