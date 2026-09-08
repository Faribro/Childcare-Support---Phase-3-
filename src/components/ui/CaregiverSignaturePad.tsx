'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Button } from './Button';
import {
  saveCaregiverSignatureBlob,
  getCaregiverSignatureBlob,
  deleteCaregiverSignatureBlob,
} from '@/lib/db/dexieDb';
import {
  PenTool,
  RotateCcw,
  CheckCircle2,
  HardDriveDownload,
  AlertCircle,
  FileCheck,
} from 'lucide-react';

interface CaregiverSignaturePadProps {
  submissionUuid: string;
  caregiverName: string;
  caregiverRelationship: string;
  initialSignatureUrl?: string;
  fallbackUuid?: string;
  onSignatureSaved?: (blob: Blob) => void;
  onSignatureCleared?: () => void;
  isSaved?: boolean;
}

export function CaregiverSignaturePad({
  submissionUuid,
  caregiverName,
  caregiverRelationship,
  initialSignatureUrl,
  fallbackUuid,
  onSignatureSaved,
  onSignatureCleared,
  isSaved: externalIsSaved,
}: CaregiverSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [isSavedLocal, setIsSavedLocal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load existing signature blob from IndexedDB or initialSignatureUrl
  useEffect(() => {
    let active = true;
    async function loadExisting() {
      try {
        let stored = submissionUuid ? await getCaregiverSignatureBlob(submissionUuid) : undefined;
        if (!stored && fallbackUuid) {
          stored = await getCaregiverSignatureBlob(fallbackUuid);
        }

        if (stored && stored.blob && active) {
          setIsSavedLocal(true);
          setHasStrokes(true);
          const url = URL.createObjectURL(stored.blob);
          setPreviewUrl(url);

          // Render onto canvas
          const img = new Image();
          img.onload = () => {
            if (!active) return;
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              }
            }
          };
          img.src = url;

          if (onSignatureSaved) {
            onSignatureSaved(stored.blob);
          }
          return;
        }

        // If no indexedDB blob exists, check initialSignatureUrl (e.g. data URL from server/draft)
        if (initialSignatureUrl && active) {
          setIsSavedLocal(true);
          setHasStrokes(true);
          setPreviewUrl(initialSignatureUrl);

          const img = new Image();
          img.onload = () => {
            if (!active) return;
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              }
            }
          };
          img.src = initialSignatureUrl;
        }
      } catch (err) {
        console.error('Failed to load caregiver signature:', err);
      }
    }
    loadExisting();
    return () => {
      active = false;
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [submissionUuid, fallbackUuid, initialSignatureUrl]);

  // Canvas stroke setup
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasStrokes(true);
    setIsSavedLocal(false);
    setStatusMessage(null);

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0F172A'; // Dark slate
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClear = async () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setHasStrokes(false);
    setIsSavedLocal(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setStatusMessage(null);
    if (submissionUuid) {
      await deleteCaregiverSignatureBlob(submissionUuid);
    }
    if (onSignatureCleared) {
      onSignatureCleared();
    }
  };

  const handleSaveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) {
      setStatusMessage('Please draw a signature before saving.');
      return;
    }

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setStatusMessage('Failed to render signature image.');
        return;
      }
      try {
        await saveCaregiverSignatureBlob(
          submissionUuid,
          blob,
          caregiverName || 'Caregiver',
          caregiverRelationship || 'Approved Caregiver'
        );
        setIsSavedLocal(true);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setStatusMessage('Saved on this device (offline IndexedDB)');
        if (onSignatureSaved) {
          onSignatureSaved(blob);
        }
      } catch (err) {
        console.error('Error saving signature Blob:', err);
        setStatusMessage('Error saving signature to local storage.');
      }
    }, 'image/png');
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-2">
            <PenTool className="h-4 w-4 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-900">Caregiver signature *</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Please ask the caregiver to sign in the box below to confirm consent.
          </p>
        </div>

        {/* Signatory Metadata Display (Locked to Caregiver) */}
        <div className="text-right sm:text-right bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Signatory</span>
          <span className="font-bold text-slate-900">{caregiverName || 'Primary Caregiver'}</span>
          <span className="text-slate-500 text-[11px] block">({caregiverRelationship || 'Caregiver'})</span>
        </div>
      </div>

      {/* Signature Canvas Area */}
      <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/50 overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-[180px] sm:h-[200px] cursor-crosshair bg-white"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />

        {!hasStrokes && !isSavedLocal && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-400">
            <PenTool className="h-6 w-6 mb-1.5 opacity-40" />
            <span className="text-xs font-medium">Draw caregiver signature with touch or mouse</span>
          </div>
        )}

        {/* Offline Saved Indicator */}
        {(isSavedLocal || externalIsSaved) && (
          <div className="absolute top-2 right-2 flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-semibold shadow-2xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Saved on this device</span>
          </div>
        )}
      </div>

      {statusMessage && (
        <div
          className={`text-xs p-2.5 rounded-xl border flex items-center space-x-2 ${
            isSavedLocal
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {isSavedLocal ? (
            <HardDriveDownload className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          )}
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleClear}
          disabled={!hasStrokes && !isSavedLocal}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          <span>Clear signature</span>
        </Button>

        <Button
          type="button"
          variant={isSavedLocal ? 'secondary' : 'primary'}
          size="sm"
          onClick={handleSaveSignature}
          disabled={!hasStrokes || isSavedLocal}
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          <span>{isSavedLocal ? 'Signature Saved' : 'Save Caregiver Signature'}</span>
        </Button>
      </div>
    </div>
  );
}
