'use client';

import React from 'react';
import { CheckCircle2, Loader2, CloudUpload } from 'lucide-react';
import type { SyncStatus } from '@/types/domain';

interface MobileContextBarProps {
  artNumber?: string;
  childName?: string;
  saveStatus?: 'saving' | 'saved' | SyncStatus;
  lastSavedText?: string;
}

export function MobileContextBar({
  artNumber,
  childName,
  saveStatus = 'saved',
  lastSavedText = 'Saved on device',
}: MobileContextBarProps) {
  if (!artNumber && !childName) {
    return null;
  }

  return (
    <div className="h-9 bg-slate-100 border-b border-slate-200/80 px-3 flex items-center justify-between text-xs text-ink-700 select-none">
      {/* Active Child Reference */}
      <div className="flex items-center space-x-1.5 min-w-0 pr-2">
        <span className="font-mono font-bold text-brand bg-blue-100/70 px-1.5 py-0.5 rounded text-[11px] truncate shrink-0">
          {artNumber || 'NEW INTAKE'}
        </span>
        {childName && (
          <span className="font-medium text-ink-900 truncate max-w-[120px] xs:max-w-[180px]">
            {childName}
          </span>
        )}
      </div>

      {/* Save State Indicator */}
      <div className="flex items-center space-x-1 text-[11px] shrink-0">
        {saveStatus === 'saving' && (
          <span className="flex items-center text-slate-500 space-x-1">
            <Loader2 className="h-3 w-3 animate-spin text-brand" />
            <span>Saving...</span>
          </span>
        )}

        {saveStatus === 'saved' && (
          <span className="flex items-center text-slate-600 space-x-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span className="hidden xs:inline">{lastSavedText}</span>
            <span className="xs:hidden">Saved</span>
          </span>
        )}

        {saveStatus === 'queued' && (
          <span className="flex items-center text-amber-700 space-x-1 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
            <CloudUpload className="h-3 w-3 text-amber-600" />
            <span>Queued</span>
          </span>
        )}

        {saveStatus === 'synced' && (
          <span className="flex items-center text-emerald-700 space-x-1 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span>Synced</span>
          </span>
        )}
      </div>
    </div>
  );
}
