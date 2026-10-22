'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, X, CheckCircle2, AlertCircle, Eye } from 'lucide-react';

export function isValidImageUrl(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (
    trimmed === 'DATA_URL_STORED_PENDING_AUTH' ||
    trimmed.startsWith('Not Submitted') ||
    trimmed.startsWith('Restricted Doc')
  ) {
    return false;
  }
  return (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/')
  );
}

interface PhotoUploadProps {
  id?: string;
  label: string;
  helperText?: string;
  value?: string;
  onChange?: (dataUrl: string | undefined) => void;
  maxSizeMb?: number;
  error?: string;
  disabled?: boolean;
}

export function PhotoUpload({
  id,
  label,
  helperText,
  value,
  onChange,
  maxSizeMb = 10,
  error: externalError,
  disabled = false,
}: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const [internalError, setInternalError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const activeError = externalError || internalError;

  // Dismiss modal on Escape key
  useEffect(() => {
    if (!isPreviewOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPreviewOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Validation: Mime type check
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      setInternalError('Invalid file type. Please select an image (JPEG, PNG, WEBP) or PDF.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 2. Validation: File size check
    if (file.size > maxSizeMb * 1024 * 1024) {
      setInternalError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds ${maxSizeMb}MB limit. Please select a smaller file.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Clear any previous error on valid file selection
    setInternalError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (onChange) onChange(result);
    };
    reader.onerror = () => {
      setInternalError('Failed to read file from storage. Please retry.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setInternalError(null);
    if (onChange) onChange(undefined);
  };

  const handleTriggerPicker = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const errorId = `${inputId}-error`;

  return (
    <div id={id ? `dropzone-wrap-${id}` : undefined} className="space-y-2">
      <label htmlFor={inputId} className="text-xs font-bold text-slate-800 block">
        {label}
      </label>
      {helperText && <p className="text-[11px] text-slate-500">{helperText}</p>}

      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={handleFileChange}
        disabled={disabled}
        aria-invalid={activeError ? 'true' : 'false'}
        aria-describedby={activeError ? errorId : undefined}
        className="hidden"
      />

      {value ? (
        <div
          className={`relative border rounded-xl p-3 bg-slate-50 flex items-center justify-between gap-3 ${
            activeError ? 'border-rose-400 ring-2 ring-rose-200' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center space-x-3 overflow-hidden min-w-0">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="relative group shrink-0 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-purple-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
              title="Click to enlarge preview"
              aria-label={`Enlarge preview for ${label}`}
            >
              <img
                src={value}
                alt={label}
                className="h-14 w-14 object-cover transition-transform group-hover:scale-105"
              />
              <span className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <Eye className="h-4 w-4" />
              </span>
            </button>
            <div className="truncate min-w-0">
              <span className="text-xs font-bold text-slate-800 flex items-center truncate">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mr-1 shrink-0" />
                Document Attached
              </span>
              <span className="text-[10px] text-slate-500 block truncate">
                Stored on device (up to {maxSizeMb}MB)
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            {/* Preview Button */}
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              aria-label={`Preview ${label}`}
              title="Preview document"
              className="touch-target-44 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-purple-700 hover:bg-purple-50 transition-colors cursor-pointer"
            >
              <Eye className="h-4 w-4" />
            </button>

            {/* Direct Replacement Flow Button */}
            <button
              type="button"
              onClick={handleTriggerPicker}
              disabled={disabled}
              aria-label={`Replace captured ${label}`}
              title="Replace document"
              className="touch-target-44 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            {/* Remove Button */}
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              aria-label={`Remove captured ${label}`}
              title="Remove document"
              className="touch-target-44 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          id={id || `btn-${inputId}`}
          type="button"
          onClick={handleTriggerPicker}
          disabled={disabled}
          aria-describedby={activeError ? errorId : undefined}
          className={`w-full min-h-[72px] border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-1 focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
            activeError
              ? 'border-rose-400 bg-rose-50/50 hover:bg-rose-100/40 ring-2 ring-rose-200'
              : 'border-slate-300 hover:border-purple-600 bg-slate-50/50 hover:bg-purple-50/30'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Camera className={`h-6 w-6 ${activeError ? 'text-rose-500' : 'text-slate-400'}`} />
          <span className={`text-xs font-bold ${activeError ? 'text-rose-900' : 'text-purple-900'}`}>
            Click to capture or upload document
          </span>
          <span className="text-[10px] text-slate-400">Up to {maxSizeMb}MB JPEG, PNG, or PDF</span>
        </button>
      )}

      {/* Error & Retry Alert */}
      {activeError && (
        <div id={errorId} className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center justify-between gap-2" role="alert">
          <div className="flex items-center space-x-1.5 min-w-0">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span className="truncate">{activeError}</span>
          </div>
          <button
            type="button"
            onClick={handleTriggerPicker}
            className="text-[11px] font-bold text-rose-800 hover:text-rose-950 underline shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Enlarged Document Preview Modal */}
      {isPreviewOpen && value && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${inputId}-preview-title`}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 id={`${inputId}-preview-title`} className="text-sm font-bold text-slate-900 truncate">
                {label} — Preview
              </h3>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                aria-label="Close preview modal"
                className="touch-target-44 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto py-4 flex items-center justify-center bg-slate-50 rounded-xl my-3 border border-slate-100">
              {value.startsWith('data:application/pdf') ? (
                <div className="text-center p-6 space-y-2">
                  <div className="text-slate-600 font-medium text-sm">PDF Document Attached</div>
                  <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-xs font-bold text-purple-700 underline"
                  >
                    Open PDF in new tab
                  </a>
                </div>
              ) : (
                <img
                  src={value}
                  alt={label}
                  className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-xs"
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span className="text-slate-500 text-[11px]">Local device attachment</span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPreviewOpen(false);
                    handleTriggerPicker();
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Replace File
                </button>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
