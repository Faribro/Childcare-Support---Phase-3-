'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import { EvaluationLoginModal } from '@/components/auth/EvaluationLoginModal';

const GISDashboard = dynamic(() => import('@/components/gis/GISDashboard'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 min-h-screen w-screen bg-slate-100 text-slate-800 flex flex-col items-center justify-center gap-4">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-teal-600" />
      <p className="text-slate-500 text-xs font-semibold tracking-wider">
        INITIALIZING ALLIANCE INDIA GIS SURVEILLANCE ENGINE...
      </p>
    </div>
  ),
});

export default function SupervisorGISPage() {
  const { isUnlocked, isLoaded } = useEvaluationAccess();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  if (!isLoaded) {
    return (
      <main className="w-screen h-screen overflow-hidden flex items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 shadow-xs space-y-4 text-center">
          <Loader2 className="w-8 h-8 text-teal-700 animate-spin mx-auto" />
          <h2 className="text-sm font-semibold text-slate-800">Verifying Authorization…</h2>
          <p className="text-xs text-slate-500">Checking credentials and scope clearance.</p>
        </div>
      </main>
    );
  }

  if (isLoaded && !isUnlocked) {
    return (
      <main className="w-screen h-screen overflow-hidden flex items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 shadow-xs space-y-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Authentication Required</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Geographic information and spatial surveillance records are restricted to authenticated personnel with authorized state and district scope.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsLoginModalOpen(true)}
              className="w-full sm:w-auto text-xs bg-teal-800 hover:bg-teal-900 text-white"
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              Sign In to Access
            </Button>
            <Link href="/app" className="w-full sm:w-auto">
              <Button variant="secondary" size="sm" className="w-full text-xs">
                Return to Forms
              </Button>
            </Link>
          </div>
        </div>
        <EvaluationLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
        />
      </main>
    );
  }

  return (
    <main className="w-screen h-screen overflow-hidden flex flex-col bg-slate-100">
      <GISDashboard />
      <EvaluationLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </main>
  );
}
