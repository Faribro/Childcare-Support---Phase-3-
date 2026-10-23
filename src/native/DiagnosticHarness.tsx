import React, { useState, useEffect, useCallback } from 'react';
import { platformRegistry } from '@/lib/platform/platformRegistry';
import { OfflineFormManager } from '@/lib/platform/offlineFormManager';
import type { AssessmentRecord, SyncQueueItem } from '@/types/domain';

export default function DiagnosticHarness({ onClose }: { onClose?: () => void }) {
  const [drafts, setDrafts] = useState<AssessmentRecord[]>([]);
  const [queue, setQueue] = useState<SyncQueueItem[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>('Ready');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const refreshState = useCallback(async () => {
    try {
      const storage = platformRegistry.getStorage();
      const network = platformRegistry.getNetwork();
      const online = await network.isOnline();
      setIsOnline(online);

      const allDrafts = await storage.getAllDrafts();
      setDrafts(allDrafts);

      const pendingQueue = await storage.getPendingQueue(undefined, true);
      setQueue(pendingQueue);
    } catch (err: any) {
      setStatusMessage(`Error refreshing state: ${err?.message}`);
    }
  }, []);

  useEffect(() => {
    refreshState();
    const network = platformRegistry.getNetwork();
    const unsub = network.onNetworkChange((online) => {
      setIsOnline(online);
      setStatusMessage(`Network status changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
    });
    return () => unsub();
  }, [refreshState]);

  const handleCreateDraft = async () => {
    setIsProcessing(true);
    setStatusMessage('Saving offline transactional draft to SQLite...');
    try {
      const record = await OfflineFormManager.createOfflineForm(
        'field-officer-01',
        'Maharashtra',
        'Pune'
      );

      const { draftId } = await OfflineFormManager.saveTransactionalDraft(record, 'field-officer-01');

      const dummyReceiptBytes = new TextEncoder().encode(`RECEIPT-${record.uuid}-SAMPLE-RECEIPT-DATA`);
      await OfflineFormManager.attachPrivateDocument(
        record.uuid,
        `receipt-${Date.now()}`,
        dummyReceiptBytes,
        'application/octet-stream',
        'fee_receipt.bin'
      );

      setStatusMessage(`Draft ${record.uuid} (ID: ${draftId}) and sandboxed attachment saved successfully.`);
      await refreshState();
    } catch (err: any) {
      setStatusMessage(`Draft creation failed: ${err?.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEnqueueOutbox = async () => {
    if (drafts.length === 0) {
      setStatusMessage('No drafts available to enqueue.');
      return;
    }
    setIsProcessing(true);
    try {
      const latest = drafts[0];
      const queueId = await OfflineFormManager.enqueueSubmission(latest, 'field-officer-01');
      setStatusMessage(`Draft ${latest.uuid} enqueued into outbox (Queue ID: ${queueId}).`);
      await refreshState();
    } catch (err: any) {
      setStatusMessage(`Enqueue failed: ${err?.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDispatchSync = async () => {
    if (queue.length === 0) {
      setStatusMessage('Outbox queue is empty.');
      return;
    }
    setIsProcessing(true);
    setStatusMessage('Dispatching sync request...');
    try {
      const firstItem = queue[0];
      const outcome = await OfflineFormManager.dispatchAuthorizedSync(
        firstItem.id || 1,
        async (url, init) => {
          return {
            status: 200,
            data: {
              status: 'success',
              acknowledged: true,
              remoteSubmissionId: `SRV-${firstItem.submissionUuid.substring(0, 8)}`,
              version: 1,
            },
          };
        }
      );
      setStatusMessage(`Sync outcome: ${outcome.status} (Acknowledged: ${outcome.acknowledged})`);
      await refreshState();
    } catch (err: any) {
      setStatusMessage(`Sync dispatch failed: ${err?.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearSecrets = async () => {
    try {
      const secureStorage = platformRegistry.getSecureStorage();
      await secureStorage.clearSecrets();
      setStatusMessage('Secure KeyStore memory wiped (User logout completed).');
    } catch (err: any) {
      setStatusMessage(`Clear secrets failed: ${err?.message}`);
    }
  };

  return (
    <div className="w-full max-w-lg bg-slate-900 text-white rounded-2xl p-4 shadow-xl border border-slate-700 my-4 text-xs font-sans">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-rose-400">Internal Storage Diagnostics</h2>
          <p className="text-[10px] text-slate-400">Development Mode Only • Not in Release UI</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs"
          >
            Close
          </button>
        )}
      </div>

      <div className="my-3 bg-slate-950 p-2.5 rounded font-mono text-[11px] text-emerald-400 break-words border border-slate-800">
        &gt; {statusMessage}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={handleCreateDraft}
          disabled={isProcessing}
          className="p-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded font-medium text-center"
        >
          1. Save Draft & File
        </button>
        <button
          onClick={handleEnqueueOutbox}
          disabled={isProcessing || drafts.length === 0}
          className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded font-medium text-center"
        >
          2. Enqueue Outbox
        </button>
        <button
          onClick={handleDispatchSync}
          disabled={isProcessing || queue.length === 0}
          className="p-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded font-medium text-center"
        >
          3. Dispatch Sync
        </button>
        <button
          onClick={handleClearSecrets}
          disabled={isProcessing}
          className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded font-medium text-center"
        >
          4. Clear KeyStore
        </button>
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <div className="flex justify-between items-center text-[11px] text-slate-400">
          <span>Local SQLite Drafts ({drafts.length})</span>
          <button onClick={refreshState} className="text-rose-400 hover:underline">Refresh</button>
        </div>
        <div className="max-h-28 overflow-y-auto space-y-1">
          {drafts.map((d) => (
            <div key={d.uuid} className="p-1.5 bg-slate-800/80 rounded flex justify-between font-mono text-[10px]">
              <span className="truncate max-w-[180px]">{d.demographics?.childName || 'Draft'}</span>
              <span className="text-slate-400">{d.syncStatus}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
