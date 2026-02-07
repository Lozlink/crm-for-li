'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore, useCRMStore } from '@realestate-crm/hooks';

export function Providers({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const isLoading = useAuthStore((s) => s.isLoading);
  const activeTeam = useAuthStore((s) => s.activeTeam);

  const hydrate = useCRMStore((s) => s.hydrate);
  const fetchContacts = useCRMStore((s) => s.fetchContacts);
  const fetchTags = useCRMStore((s) => s.fetchTags);
  const clearData = useCRMStore((s) => s.clearData);

  const [dataLoaded, setDataLoaded] = useState(false);
  const prevTeamIdRef = useRef<string | undefined>(undefined);

  // Initialize auth
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Clear CRM data when user signs out
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isDemoMode) {
      clearData();
      setDataLoaded(false);
    }
  }, [isAuthenticated, isDemoMode, isLoading, clearData]);

  // Load CRM data once auth + team are resolved
  useEffect(() => {
    if (dataLoaded) return;
    if (isDemoMode || (isAuthenticated && activeTeam)) {
      const loadData = async () => {
        await hydrate();
        await fetchTags();
        await fetchContacts();
        setDataLoaded(true);
      };
      loadData();
    }
  }, [isDemoMode, isAuthenticated, activeTeam, dataLoaded, hydrate, fetchTags, fetchContacts]);

  // Reset data when active team changes
  useEffect(() => {
    if (activeTeam?.id && prevTeamIdRef.current && activeTeam.id !== prevTeamIdRef.current) {
      setDataLoaded(false);
    }
    prevTeamIdRef.current = activeTeam?.id;
  }, [activeTeam?.id]);

  return <>{children}</>;
}
