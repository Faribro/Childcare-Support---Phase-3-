'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { getAllDrafts, deleteDraft } from '@/lib/db/draftRepository';
import type { AssessmentRecord } from '@/types/domain';
import { FileText, PlusCircle, Trash2, ArrowRight, Clock, User, HeartPulse } from 'lucide-react';

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<AssessmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDrafts = async () => {
    setIsLoading(true);
    try {
      const items = await getAllDrafts();
      setDrafts(items);
    } catch (err) {
      console.error('Failed to load drafts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDrafts();
  }, []);

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (confirm('Are you sure you want to permanently delete this saved draft?')) {
      await deleteDraft(id);
      await loadDrafts();
    }
  };

  return (
    <AppShell>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 sm:py-6 lg:py-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 mb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-brand text-xs font-bold uppercase tracking-wider mb-1">
              <FileText className="h-4 w-4" />
              <span>Offline Drafts Storage</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-ink-900">Saved Assessment Drafts</h1>
            <p className="text-xs sm:text-sm text-ink-600 mt-0.5">
              Drafts are stored securely in your browser’s IndexedDB. They remain accessible even without internet.
            </p>
          </div>

          <Link href="/assessment/new">
            <Button variant="primary" className="w-full sm:w-auto shadow-sm">
              <PlusCircle className="h-4 w-4 mr-2" />
              <span>New Assessment</span>
            </Button>
          </Link>
        </div>

        {/* Content Section */}
        {isLoading ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading drafts from device storage...</div>
        ) : drafts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center max-w-lg mx-auto shadow-sm">
            <div className="bg-blue-50 text-brand h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8" />
            </div>
            <h3 className="text-base font-bold text-ink-900">No Saved Drafts</h3>
            <p className="text-xs sm:text-sm text-ink-600 mt-1 max-w-sm mx-auto">
              Any partially completed assessment will automatically save here so you never lose data during field visits.
            </p>
            <div className="mt-6">
              <Link href="/assessment/new">
                <Button variant="primary">Start an Assessment</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {drafts.map((draft) => (
              <div
                key={draft.uuid}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-bold text-brand bg-blue-50 px-2 py-0.5 rounded">
                      {draft.demographics?.artNumber || 'PENDING ID'}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      Step {draft.stepIndex || 1} of 6
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-ink-900 leading-tight">
                    {draft.demographics?.childName || 'Unnamed Intake'}
                  </h3>

                  <div className="mt-3 space-y-1 text-xs text-ink-600">
                    <div className="flex items-center space-x-1.5">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <span>Caregiver: {draft.demographics?.caregiverName || 'Not recorded'}</span>
                    </div>
                    {draft.nutrition?.nutritionStatus && (
                      <div className="flex items-center space-x-1.5">
                        <HeartPulse className="h-3.5 w-3.5 text-slate-400" />
                        <span>Status: {draft.nutrition.nutritionStatus}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1.5 text-slate-400 text-[11px]">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Last edited: {new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleDelete(draft.id)}
                    className="p-2 text-slate-400 hover:text-alert-rose transition-colors rounded-lg hover:bg-rose-50"
                    title="Delete draft"
                    aria-label="Delete draft"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  <Link href="/assessment/new">
                    <Button variant="secondary" size="sm" className="font-bold">
                      <span>Resume</span>
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
