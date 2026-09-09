'use client';

import dynamic from 'next/dynamic';

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
  return (
    <main className="w-screen h-screen overflow-hidden flex flex-col bg-slate-100">
      <GISDashboard />
    </main>
  );
}
