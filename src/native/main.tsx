import React, { Suspense, useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '@/app/globals.css';
import { platformRegistry } from '@/lib/platform/platformRegistry';
import { usePathname, useRouter } from 'next/navigation';

// Shared Application Screens
import NewSinglePageAssessment from '@/app/assessment/new/page';
import DedicatedDraftsPage from '@/app/assessment/drafts/page';
import ResumeDraftSinglePage from '@/app/assessment/draft/[draftId]/page';
import DraftReviewPage from '@/app/assessment/draft/[draftId]/review/page';
import SyncCentrePage from '@/app/assessment/sync/page';
import FieldWorkspacePage from '@/app/app/page';
import AssessmentReceiptPage from '@/app/assessment/record/[submissionId]/receipt/page';
import RecordDetailPage from '@/app/assessment/record/[submissionId]/page';
import RecordEditPage from '@/app/assessment/record/[submissionId]/edit/page';
import SupervisorDashboardPage from '@/app/supervisor/page';
import SupervisorAssessmentsPage from '@/app/supervisor/assessments/page';
import SupervisorAssessmentDetailPage from '@/app/supervisor/assessments/[submissionId]/page';
import LandingPage from '@/app/page';
import { SyncProvider } from '@/components/sync/SyncProvider';

// Internal Development Diagnostics (tree-shaken in production)
const IS_DEV = process.env.NODE_ENV !== 'production';
let DiagnosticHarness: React.ComponentType<{ onClose?: () => void }> | null = null;
if (IS_DEV) {
  import('./DiagnosticHarness').then((mod) => {
    DiagnosticHarness = mod.default;
  });
}

// Initialize platform registry for native Android target
platformRegistry.configure({
  target: 'android',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'https://childcare-support-phase-3-peqat23bz-hashcode1.vercel.app',
});

import { enqueueCreate, getDispatchQueue } from '@/features/submission/submissionQueueRepository';
import { getQueueStats } from '@/lib/db/syncQueueRepository';
import { processQueue, isWorkerRunning } from '@/features/submission/submissionWorker';
import { gatewayCreate, gatewayUpdate, lookupByClientSubmissionId } from '@/features/submission/submissionGateway';
import { saveDraft, getDraftByUuid, getDraftsCount } from '@/lib/db/draftRepository';

if (typeof window !== 'undefined') {
  (window as any).__NATIVE_CLIENT__ = {
    platformRegistry,
    saveDraft,
    getDraftByUuid,
    getDraftsCount,
    enqueueCreate,
    getDispatchQueue,
    getQueueStats,
    processQueue,
    isWorkerRunning,
    gatewayCreate,
    gatewayUpdate,
    lookupByClientSubmissionId,
  };
}

function RouteRenderer() {
  const pathname = usePathname();

  // Match /assessment/draft/:draftId/review
  if (/^\/assessment\/draft\/[^/]+\/review\/?$/.test(pathname)) {
    return <DraftReviewPage />;
  }

  // Match /assessment/draft/:draftId
  if (/^\/assessment\/draft\/[^/]+\/?$/.test(pathname)) {
    return <ResumeDraftSinglePage />;
  }

  // Match /assessment/record/:submissionId/receipt
  if (/^\/assessment\/record\/[^/]+\/receipt\/?$/.test(pathname)) {
    return <AssessmentReceiptPage />;
  }

  // Match /assessment/record/:submissionId/edit
  if (/^\/assessment\/record\/[^/]+\/edit\/?$/.test(pathname)) {
    return <RecordEditPage />;
  }

  // Match /assessment/record/:submissionId
  if (/^\/assessment\/record\/[^/]+\/?$/.test(pathname)) {
    return <RecordDetailPage />;
  }

  // Match /supervisor/assessments/:submissionId
  if (/^\/supervisor\/assessments\/[^/]+\/?$/.test(pathname)) {
    return <SupervisorAssessmentDetailPage />;
  }

  // Explicit route mappings
  if (pathname === '/app') {
    return <FieldWorkspacePage />;
  }
  if (pathname === '/assessment/drafts') {
    return <DedicatedDraftsPage />;
  }
  if (pathname === '/assessment/sync') {
    return <SyncCentrePage />;
  }
  if (pathname === '/supervisor') {
    return <SupervisorDashboardPage />;
  }
  if (pathname === '/supervisor/assessments') {
    return <SupervisorAssessmentsPage />;
  }
  if (pathname === '/' || pathname === '/landing') {
    return <LandingPage />;
  }
  if (pathname === '/assessment/new') {
    return <NewSinglePageAssessment />;
  }

  // Default fallback to NewSinglePageAssessment
  return <NewSinglePageAssessment />;
}

function NativeAppRoot() {
  const [showDevHarness, setShowDevHarness] = useState(false);
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen">
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <span>Loading Childcare Support…</span>
            </div>
          </div>
        }
      >
        <SyncProvider>
          <RouteRenderer />
        </SyncProvider>
      </Suspense>

      {/* Development-Only Diagnostic Modal (Stripped in release builds) */}
      {IS_DEV && showDevHarness && DiagnosticHarness && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <DiagnosticHarness onClose={() => setShowDevHarness(false)} />
        </div>
      )}

      {/* Hidden Development Diagnostic Launcher */}
      {IS_DEV && !showDevHarness && (
        <div className="fixed bottom-2 right-2 z-40 opacity-30 hover:opacity-100 transition-opacity">
          <button
            onClick={() => setShowDevHarness(true)}
            className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded shadow"
            title="Internal Diagnostics (DEV ONLY)"
          >
            DEBUG
          </button>
        </div>
      )}
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <NativeAppRoot />
    </React.StrictMode>
  );
}
