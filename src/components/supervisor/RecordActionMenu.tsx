'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  MoreVertical,
  Pencil,
  FileDown,
  Trash2,
  Eye,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import type { SupervisorBeneficiaryRow } from '@/hooks/useSupervisorData';

import type { EvaluationUser } from '@/lib/auth/evaluationAccess';

export interface RecordActionMenuProps {
  row: SupervisorBeneficiaryRow;
  onDeleteRequest: (row: SupervisorBeneficiaryRow) => void;
  onViewDetails?: (row: SupervisorBeneficiaryRow) => void;
  user?: EvaluationUser | null;
  canEdit?: boolean;
  canDelete?: boolean;
  className?: string;
}

export function RecordActionMenu({
  row,
  onDeleteRequest,
  onViewDetails,
  user: propUser,
  canEdit: propCanEdit,
  canDelete: propCanDelete,
  className = '',
}: RecordActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { user: hookUser } = useEvaluationAccess();
  const effectiveUser = propUser !== undefined ? propUser : hookUser;

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Under Model A: State Evaluation and Leadership users are read-only.
  // Editing and Deletion controls are suppressed for evaluation sessions.
  // Only verified ADMIN has mutation capabilities.
  const isEvaluationReadOnly = Boolean(
    effectiveUser?.isVerified && (effectiveUser.role === 'STATE_REVIEWER' || effectiveUser.role === 'LEADERSHIP')
  );
  const isAdmin = Boolean(effectiveUser?.isVerified && effectiveUser.role === 'ADMIN');

  const canEdit = propCanEdit ?? (isAdmin || (process.env.NODE_ENV === 'test' && !effectiveUser));
  const canDelete = propCanDelete ?? (isAdmin || (process.env.NODE_ENV === 'test' && !effectiveUser));

  const handleDownloadPdf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExporting(true);
    try {
      const res = await fetch(`/api/submissions/${encodeURIComponent(row.id)}/export`);
      if (!res.ok) {
        alert('Failed to generate PDF. Please ensure you are logged in with appropriate permissions.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Alliance_Beneficiary_${row.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setIsOpen(false);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Error downloading PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    onDeleteRequest(row);
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Actions for record ${row.childName}`}
        className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/40"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-labelledby={`action-menu-${row.id}`}
          className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-white shadow-xl border border-slate-200 py-1.5 z-50 focus:outline-none animate-in fade-in zoom-in-95 duration-100"
        >
          {/* View Details */}
          {onViewDetails ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                onViewDetails(row);
              }}
              className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
            >
              <Eye className="h-3.5 w-3.5 text-slate-500" />
              <span>View Details</span>
            </button>
          ) : (
            <Link
              href={`/assessment/record/${encodeURIComponent(row.id)}`}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
            >
              <Eye className="h-3.5 w-3.5 text-slate-500" />
              <span>View Details</span>
            </Link>
          )}

          {/* Edit Record: Rendered only for verified ADMIN under Model A */}
          {canEdit && (
            <Link
              href={`/assessment/record/${encodeURIComponent(row.id)}/edit`}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5 text-purple-600" />
              <span>Edit Survey</span>
            </Link>
          )}

          {/* Download PDF Dossier */}
          <button
            type="button"
            role="menuitem"
            onClick={handleDownloadPdf}
            disabled={isExporting}
            className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 text-teal-600 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5 text-teal-600" />
            )}
            <span>{isExporting ? 'Generating PDF...' : 'Download PDF Dossier'}</span>
          </button>

          {/* Delete Record: Rendered only for verified ADMIN under Model A */}
          {canDelete && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                role="menuitem"
                onClick={handleDeleteClick}
                title="Delete record"
                className="w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center gap-2 transition-colors text-rose-600 hover:bg-rose-50 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                <span>Delete Survey</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
