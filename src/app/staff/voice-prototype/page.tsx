import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/server/sessionService';
import VoiceStaffHarness from '@/features/voice-agent/components/VoiceStaffHarness';

export const metadata = {
  title: 'Voice Agent Staff Prototype (Isolated)',
  description: 'Staff-only synthetic calling-agent evaluation harness',
};

export default function VoicePrototypePage() {
  const isDev = process.env.NODE_ENV === 'development';

  if (!isDev) {
    const cookieStore = cookies();
    const token = cookieStore.get('evaluation_session_token')?.value;
    const session = token ? verifySessionToken(token) : null;
    if (!session || !['ADMIN', 'LEADERSHIP', 'STATE_REVIEWER'].includes(session.role)) {
      redirect('/login?returnUrl=/staff/voice-prototype');
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Staff Calling-Agent Evaluation Harness (Part C Prototype)
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Isolated synthetic conversation harness. Beneficiaries do not access this workspace.
              External telephone trunks and WhatsApp calling are disconnected.
            </p>
          </div>
          <span className="px-3 py-1 bg-amber-100 text-amber-900 text-xs font-mono font-semibold rounded-full border border-amber-300">
            STAFF TEST ONLY
          </span>
        </div>
      </div>
      <VoiceStaffHarness />
    </main>
  );
}
