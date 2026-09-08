'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDraftByAnyId } from '@/lib/db/draftRepository';

/**
 * Temporary Guarded Migration Redirect for legacy /assessment/[id] paths
 * Determines whether id is a local draft or a remote record and redirects to explicit routes.
 */
export default function AssessmentLegacyRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  useEffect(() => {
    async function redirect() {
      if (!id) {
        router.replace('/');
        return;
      }
      try {
        const localDraft = await getDraftByAnyId(id);
        if (localDraft) {
          router.replace(`/assessment/draft/${localDraft.id || localDraft.uuid}`);
        } else {
          router.replace(`/assessment/record/${id}`);
        }
      } catch {
        router.replace(`/assessment/record/${id}`);
      }
    }
    redirect();
  }, [id, router]);

  return (
    <div className="p-12 text-center text-xs text-slate-500">
      Redirecting to canonical assessment route...
    </div>
  );
}
