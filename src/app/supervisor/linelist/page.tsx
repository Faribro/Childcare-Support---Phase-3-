'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Permanent Redirect: /supervisor/linelist -> /supervisor/assessments
 * Per architectural specification, the canonical linelist namespace is /supervisor/assessments.
 */
export default function LinelistRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/supervisor/assessments');
  }, [router]);

  return (
    <div className="p-12 text-center text-xs text-slate-500">
      Redirecting to Master Linelist (/supervisor/assessments)...
    </div>
  );
}
