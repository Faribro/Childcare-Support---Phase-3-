'use client';

import React, { useRef, useState } from 'react';
import { Button } from './Button';
import { Camera, Upload, X, CheckCircle2, FileText, AlertCircle } from 'lucide-react';

interface PhotoUploadProps {
  id?: string;
  label: string;
  helperText?: string;
  value?: string;
  onChange?: (dataUrl: string | undefined) => void;
  maxSizeMb?: number;
  error?: string;
}

export function PhotoUpload({
  id,
  label,
  helperText,
  value,
  onChange,
  maxSizeMb = 10,
  error: externalError,
}: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const [internalError, setInternalError] = useState<string | null>(null);
  const activeError = externalError || internalError;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeMb * 1024 * 1024) {
      setInternalError(`File size exceeds ${maxSizeMb}MB. Please select a smaller image.`);
      return;
    }

    setInternalError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (onChange) onChange(result);
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

  const errorId = `${inputId}-error`;

  return (
    <div id={id ? `dropzone-wrap-${id}` : undefined} className="space-y-2">
      <label htmlFor={inputId} className="text-xs font-bold text-slate-800 block">{label}</label>
      {helperText && <p className="text-[11px] text-slate-500">{helperText}</p>}

      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {value ? (
        <div className={`relative border rounded-xl p-3 bg-slate-50 flex items-center justify-between gap-3 ${activeError ? 'border-rose-400 ring-2 ring-rose-200' : 'border-slate-200'}`}>
          <div className="flex items-center space-x-3 overflow-hidden min-w-0">
            <img
              src={value}
              alt={label}
              className="h-14 w-14 object-cover rounded-lg border border-slate-200 shrink-0"
            />
            <div className="truncate min-w-0">
              <span className="text-xs font-bold text-slate-800 flex items-center truncate">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mr-1 shrink-0" />
                Document Captured
              </span>
              <span className="text-[10px] text-slate-500 block truncate">Stored on device (up to {maxSizeMb}MB)</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRemove}
            aria-label={`Remove captured ${label}`}
            className="touch-target-44 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <button
          id={id || `btn-${inputId}`}
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-describedby={activeError ? errorId : undefined}
          className={`w-full min-h-[72px] border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-1 focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
            activeError
              ? 'border-rose-400 bg-rose-50/50 hover:bg-rose-100/40 ring-2 ring-rose-200'
              : 'border-slate-300 hover:border-purple-600 bg-slate-50/50 hover:bg-purple-50/30'
          }`}
        >
          <Camera className={`h-6 w-6 ${activeError ? 'text-rose-500' : 'text-slate-400'}`} />
          <span className={`text-xs font-bold ${activeError ? 'text-rose-900' : 'text-purple-900'}`}>Click to capture or upload photo</span>
          <span className="text-[10px] text-slate-400">Up to {maxSizeMb}MB JPEG or PNG</span>
        </button>
      )}

      {activeError && (
        <p id={errorId} className="text-xs font-semibold text-rose-600 flex items-center space-x-1 mt-1" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{activeError}</span>
        </p>
      )}
    </div>
  );
}
