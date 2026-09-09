'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';

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

  if (isLoaded && !isUnlocked) {
    return (
      <main className="w-screen h-screen overflow-hidden flex items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 shadow-xs space-y-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">GIS Engine Restricted</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Geographic information and spatial surveillance records are restricted to authorized personnel.
          </p>
          <div className="pt-2">
            <Link href="/">
              <Button variant="primary" size="sm">
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="w-screen h-screen overflow-hidden flex flex-col bg-slate-100">
      <GISDashboard />
    </main>
  );
}
