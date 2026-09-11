'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  supervisorReadModel,
  SupervisorReadModelState,
  SupervisorBeneficiaryRow,
  SupervisorDataStatus,
  SupervisorDataError,
  BeneficiaryDocumentStatus,
  evaluateDocuments,
  parseBeneficiaryRecord,
} from '@/lib/read-model/supervisorReadModel';

export type {
  BeneficiaryDocumentStatus,
  SupervisorBeneficiaryRow,
  SupervisorDataStatus,
  SupervisorDataError,
};

export { evaluateDocuments, parseBeneficiaryRecord };

export interface SupervisorDataHook {
  status: SupervisorDataStatus;
  records: SupervisorBeneficiaryRow[];
  total: number;
  lastRefreshed: Date | null;
  error: SupervisorDataError | null;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  setRecords: (updater: React.SetStateAction<SupervisorBeneficiaryRow[]>) => void;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  isOfflineCache: boolean;
  isUnauthenticated: boolean;
  isSessionExpired: boolean;
}

export function useSupervisorData(options?: { autoFetch?: boolean }): SupervisorDataHook {
  const [modelState, setModelState] = useState<SupervisorReadModelState>(() =>
    supervisorReadModel.getSnapshot()
  );

  useEffect(() => {
    const unsubscribe = supervisorReadModel.subscribe(() => {
      setModelState(supervisorReadModel.getSnapshot());
    });
    setModelState(supervisorReadModel.getSnapshot());
    return unsubscribe;
  }, []);

  const refresh = useCallback(async () => {
    await supervisorReadModel.fetchSubmissions({ force: true });
  }, []);

  const retry = useCallback(async () => {
    await supervisorReadModel.fetchSubmissions({ force: true });
  }, []);

  const setRecords = useCallback((updater: React.SetStateAction<SupervisorBeneficiaryRow[]>) => {
    supervisorReadModel.setRecords(updater);
  }, []);

  return {
    status: modelState.status,
    records: modelState.records,
    total: modelState.total,
    lastRefreshed: modelState.lastRefreshed,
    error: modelState.error,
    refresh,
    retry,
    setRecords,
    isLoading: modelState.status === 'loading',
    isError: modelState.status === 'error',
    isEmpty: modelState.status === 'empty',
    isOfflineCache: modelState.status === 'offline_cache',
    isUnauthenticated: modelState.status === 'unauthenticated',
    isSessionExpired: modelState.status === 'session_expired',
  };
}
