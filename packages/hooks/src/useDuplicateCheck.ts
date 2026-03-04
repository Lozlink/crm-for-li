import { useCallback } from 'react';
import { findSingleDuplicate, findDuplicates } from '@realestate-crm/utils';
import type { DedupContact } from '@realestate-crm/utils';
import type { Contact } from '@realestate-crm/types';
import { useCRMStore } from './useCRMStore';

export function useDuplicateCheck() {
  const contacts = useCRMStore((s) => s.contacts);

  const checkForDuplicate = useCallback(
    (incoming: DedupContact): Contact | null => {
      return findSingleDuplicate(incoming, contacts);
    },
    [contacts],
  );

  const checkForDuplicates = useCallback(
    (incoming: DedupContact[]): Map<number, Contact> => {
      return findDuplicates(incoming, contacts);
    },
    [contacts],
  );

  return { checkForDuplicate, checkForDuplicates };
}
