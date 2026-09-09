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
      <label className="text-xs font-bold text-slate-800 block">{label}</label>
      {helperText && <p className="text-[11px] text-slate-500">{helperText}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {value ? (
        <div className="relative border border-black rounded-xl p-2.5 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center space-x-3 overflow-hidden">
            <img
              src={value}
              alt={label}
              className="h-14 w-14 object-cover rounded-lg border border-black shrink-0"
            />
            <div className="truncate">
              <span className="text-xs font-bold text-slate-800 flex items-center">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mr-1 shrink-0" />
                Document Captured
              </span>
              <span className="text-[10px] text-slate-500">Stored on device (up to {maxSizeMb}MB)</span>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-slate-500 hover:text-rose-600 p-2 min-h-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-black/30 hover:border-purple-600 rounded-xl p-4 text-center cursor-pointer bg-slate-50/50 hover:bg-purple-50/30 transition-colors"
        >
          <div className="flex flex-col items-center justify-center">
            <Camera className="h-6 w-6 text-slate-400 mb-1" />
            <span className="text-xs font-bold text-purple-900">Click to capture or upload file</span>
            <span className="text-[10px] text-slate-400 mt-0.5">Up to {maxSizeMb}MB JPEG or PNG</span>
          </div>
        </div>
      )}

      {error && (
        <div className="text-[11px] text-rose-700 flex items-center space-x-1">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
