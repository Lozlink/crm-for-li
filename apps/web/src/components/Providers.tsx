'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@realestate-crm/hooks';
import { useCRMStore } from '@realestate-crm/hooks';

export function Providers({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  const hydrate = useCRMStore((s) => s.hydrate);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (isAuthenticated || isDemoMode) {
      hydrate();
    }
  }, [isAuthenticated, isDemoMode, hydrate]);

  return <>{children}</>;
}
