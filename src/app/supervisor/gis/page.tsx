'use client';

import dynamic from 'next/dynamic';

const GISDashboard = dynamic(() => import('@/components/gis/GISDashboard'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 min-h-screen w-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-teal-500" />
      <p className="text-slate-400 text-xs font-semibold tracking-wider">
        INITIALIZING ALLIANCE INDIA GIS SURVEILLANCE ENGINE...
      </p>
    </div>
  ),
});

export default function SupervisorGISPage() {
  return (
    <main className="w-screen h-screen overflow-hidden flex flex-col bg-slate-950">
      <GISDashboard />
    </main>
  );
}
