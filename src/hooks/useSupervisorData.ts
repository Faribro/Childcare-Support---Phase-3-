'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  supervisorReadModel,
  SupervisorReadModelState,
  SupervisorBeneficiaryRow,
  SupervisorDataStatus,
  SupervisorDataError,
  BeneficiaryDocumentStatus,
  NetworkStatus,
  DataSource,
  SyncStatus,
  FormattedStatus,
  formatSystemStatus,
  evaluateDocuments,
  parseBeneficiaryRecord,
} from '@/lib/read-model/supervisorReadModel';

export type {
  BeneficiaryDocumentStatus,
  SupervisorBeneficiaryRow,
  SupervisorDataStatus,
  SupervisorDataError,
  NetworkStatus,
  DataSource,
  SyncStatus,
  FormattedStatus,
};

export { evaluateDocuments, parseBeneficiaryRecord };

export interface SupervisorDataHook {
  status: SupervisorDataStatus;
  records: SupervisorBeneficiaryRow[];
  total: number;
  lastRefreshed: Date | null;
  error: SupervisorDataError | null;
  refresh: () => Promise<void>;
  fetchWithFilters: (filters: { state?: string; district?: string }) => Promise<void>;
  retry: () => Promise<void>;
  setRecords: (updater: React.SetStateAction<SupervisorBeneficiaryRow[]>) => void;
  activeFilters: { state?: string; district?: string };
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  isOfflineCache: boolean;
  networkStatus: NetworkStatus;
  dataSource: DataSource;
  syncStatus: SyncStatus;
  formattedStatus: FormattedStatus;
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

  const fetchWithFilters = useCallback(async (filters: { state?: string; district?: string }) => {
    await supervisorReadModel.fetchSubmissions({ force: true, ...filters });
  }, []);

  const retry = useCallback(async () => {
    await supervisorReadModel.fetchSubmissions({ force: true });
  }, []);

  const setRecords = useCallback((updater: React.SetStateAction<SupervisorBeneficiaryRow[]>) => {
    supervisorReadModel.setRecords(updater);
  }, []);

  const formattedStatus = useMemo(
    () =>
      formatSystemStatus({
        networkStatus: modelState.networkStatus,
        dataSource: modelState.dataSource,
        syncStatus: modelState.syncStatus,
      }),
    [modelState.networkStatus, modelState.dataSource, modelState.syncStatus]
  );

  return {
    status: modelState.status,
    records: modelState.records,
    total: modelState.total,
    lastRefreshed: modelState.lastRefreshed,
    error: modelState.error,
    refresh,
    fetchWithFilters,
    retry,
    setRecords,
    activeFilters: supervisorReadModel.getActiveFilters(),
    isLoading: modelState.status === 'loading',
    isError: modelState.status === 'error',
    isEmpty: modelState.status === 'empty',
    isOfflineCache: modelState.status === 'offline_cache',
    networkStatus: modelState.networkStatus,
    dataSource: modelState.dataSource,
    syncStatus: modelState.syncStatus,
    formattedStatus,
  };
}
