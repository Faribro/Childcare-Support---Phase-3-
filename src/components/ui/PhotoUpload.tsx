'use client';

import React, { useRef, useState } from 'react';
import { Button } from './Button';
import { Camera, Upload, X, CheckCircle2, FileText, AlertCircle } from 'lucide-react';

interface PhotoUploadProps {
  label: string;
  helperText?: string;
  value?: string;
  onChange?: (dataUrl: string | undefined) => void;
  maxSizeMb?: number;
}

export function PhotoUpload({
  label,
  helperText,
  value,
  onChange,
  maxSizeMb = 10,
}: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputId = React.useId();
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`File size exceeds ${maxSizeMb}MB. Please select a smaller image.`);
      return;
    }

    setError(null);
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
    setError(null);
    if (onChange) onChange(undefined);
  };

  return (
    <div className="space-y-2">
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
        <div className="relative border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center justify-between gap-3">
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
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full min-h-[72px] border-2 border-dashed border-slate-300 hover:border-purple-600 rounded-xl p-4 text-center cursor-pointer bg-slate-50/50 hover:bg-purple-50/30 transition-colors flex flex-col items-center justify-center gap-1 focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
        >
          <Camera className="h-6 w-6 text-slate-400" />
          <span className="text-xs font-bold text-purple-900">Click to capture or upload photo</span>
          <span className="text-[10px] text-slate-400">Up to {maxSizeMb}MB JPEG or PNG</span>
        </button>
      )}

      {error && (
        <div className="text-[11px] text-rose-700 flex items-center space-x-1" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
