import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authorizeVoiceStaffAccess } from '@/lib/server/voiceStaffAuth';
import VoiceStaffHarness from '@/features/voice-agent/components/VoiceStaffHarness';

export const metadata = {
  title: 'Voice Agent Staff Prototype (Isolated)',
  description: 'Staff-only synthetic calling-agent evaluation harness',
};

export default function VoicePrototypePage() {
  const cookieStore = cookies();
  const headerStore = headers();

  // Strict server-side authorization check:
  // Requires ADMIN, LEADERSHIP, or STATE_REVIEWER session.
  // Local bypass strictly requires ALLOW_LOCAL_STAFF_VOICE_BYPASS === 'true' and loopback host.
  const auth = authorizeVoiceStaffAccess({
    cookies: cookieStore,
    headers: headerStore,
  });

  if (!auth.authorized) {
    redirect('/login?returnUrl=/staff/voice-prototype');
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
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-amber-100 text-amber-900 text-xs font-mono font-semibold rounded-full border border-amber-300">
              STAFF TEST ONLY
            </span>
            {auth.user && (
              <span className="px-2 py-1 bg-slate-200 text-slate-700 text-xs font-mono rounded">
                User: {auth.user.userId} ({auth.user.role})
              </span>
            )}
          </div>
        </div>
      </div>
      <VoiceStaffHarness />
    </main>
  );
}
