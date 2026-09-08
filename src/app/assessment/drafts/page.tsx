'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Permanent Redirect: /assessment/drafts -> /assessment/sync?tab=drafts
 * Per architectural unification requirement, local drafts are hosted under the Sync Centre.
 */
export default function DraftsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/assessment/sync?tab=drafts');
  }, [router]);

  return (
    <div className="p-12 text-center text-xs text-slate-500">
      Loading Saved Drafts in Sync Centre...
    </div>
  );
}
