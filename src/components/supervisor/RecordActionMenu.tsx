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

export interface RecordActionMenuProps {
  row: SupervisorBeneficiaryRow;
  onDeleteRequest: (row: SupervisorBeneficiaryRow) => void;
  onViewDetails?: (row: SupervisorBeneficiaryRow) => void;
  className?: string;
}

export function RecordActionMenu({
  row,
  onDeleteRequest,
  onViewDetails,
  className = '',
}: RecordActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { user } = useEvaluationAccess();

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

  // Authorization check for deletion
  const canDelete = React.useMemo(() => {
    if (!user) return true; // Default fallback to allow trigger (server enforces security)
    if (user.role === 'ADMIN') return true;
    if (user.role === 'STATE_REVIEWER') {
      if (user.allowedStates?.includes('*')) return true;
      return (
        user.allowedStates?.some(
          (s) => s.toLowerCase() === (row.state || 'Maharashtra').toLowerCase()
        ) ?? false
      );
    }
    return false;
  }, [user, row.state]);

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

          {/* Edit Record */}
          <Link
            href={`/assessment/record/${encodeURIComponent(row.id)}/edit`}
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5 text-purple-600" />
            <span>Edit Survey</span>
          </Link>

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

          <div className="my-1 border-t border-slate-100" />

          {/* Delete Record */}
          <button
            type="button"
            role="menuitem"
            onClick={handleDeleteClick}
            disabled={!canDelete}
            title={canDelete ? 'Delete record' : 'Only authorized state reviewers or admins can delete records'}
            className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center gap-2 transition-colors ${
              canDelete
                ? 'text-rose-600 hover:bg-rose-50 cursor-pointer'
                : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            <span>Delete Survey</span>
          </button>
        </div>
      )}
    </div>
  );
}
