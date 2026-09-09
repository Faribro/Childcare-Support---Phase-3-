'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  Trash2,
  FileCheck,
  ShieldCheck,
  Undo2,
} from 'lucide-react';

interface Point {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

interface Stroke {
  points: Point[];
  color: string;
  baseWidth: number;
}

interface CaregiverSignaturePadProps {
  submissionUuid: string;
  caregiverName: string;
  caregiverRelationship: string;
  initialSignatureUrl?: string;
  fallbackUuid?: string;
  onSignatureChange?: (dataUrl: string) => void;
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
  onSignatureChange,
  onSignatureSaved,
  onSignatureCleared,
  isSaved: externalIsSaved,
}: CaregiverSignaturePadProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [isSavedLocal, setIsSavedLocal] = useState(false);
  const [inkColor, setInkColor] = useState('#0F172A'); // Midnight Navy or Royal Blue
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Redraw all strokes onto canvas with high-DPI scaling
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    // Render baseline signing guide
    const lineY = Math.round(height * 0.72);
    ctx.save();
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.75)'; // slate-300
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(16, lineY);
    ctx.lineTo(width - 16, lineY);
    ctx.stroke();

    // Small 'x' mark at the left of baseline
    ctx.setLineDash([]);
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
    ctx.fillText('✕', 18, lineY - 4);
    ctx.restore();

    // Render all saved strokes with smooth Bézier interpolation
    const allStrokes = [...strokesRef.current];
    if (currentStrokeRef.current) {
      allStrokes.push(currentStrokeRef.current);
    }

    for (const stroke of allStrokes) {
      const pts = stroke.points;
      if (pts.length === 0) continue;

      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (pts.length === 1) {
        // Single dot tap
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, stroke.baseWidth * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);

      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.lineWidth = stroke.baseWidth;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }

      // Final segment
      const last = pts[pts.length - 1];
      ctx.lineWidth = stroke.baseWidth;
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  // Synchronize internal canvas dimensions with client rect and pixel ratio
  const syncCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const displayWidth = Math.max(Math.round(rect.width), 300);
    const displayHeight = Math.max(Math.round(rect.height), 180);

    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.resetTransform?.();
        ctx.scale(dpr, dpr);
      }
      redraw();
    }
  }, [redraw]);

  // Handle window resize and initial load
  useEffect(() => {
    syncCanvasDimensions();
    const handleResize = () => {
      syncCanvasDimensions();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [syncCanvasDimensions]);

  // Load existing signature from IndexedDB or initialSignatureUrl
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
          const url = URL.createObjectURL(stored.blob);
          const img = new Image();
          img.onload = () => {
            if (!active) return;
            syncCanvasDimensions();
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                const rect = canvas.getBoundingClientRect();
                ctx.drawImage(img, 0, 0, rect.width, rect.height);
                setStrokeCount(1);
              }
            }
          };
          img.src = url;
          if (onSignatureSaved) onSignatureSaved(stored.blob);
          return;
        }

        if (initialSignatureUrl && active) {
          setIsSavedLocal(true);
          const img = new Image();
          img.onload = () => {
            if (!active) return;
            syncCanvasDimensions();
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                const rect = canvas.getBoundingClientRect();
                ctx.drawImage(img, 0, 0, rect.width, rect.height);
                setStrokeCount(1);
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
    };
  }, [submissionUuid, fallbackUuid, initialSignatureUrl, onSignatureSaved, syncCanvasDimensions]);

  // Precise pointer coordinate getter
  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, pressure: 0.5, time: Date.now() };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure && e.pressure > 0 ? e.pressure : 0.5,
      time: Date.now(),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsDrawing(true);
    setIsSavedLocal(false);
    setStatusMessage(null);

    const pt = getPointerPos(e);
    currentStrokeRef.current = {
      points: [pt],
      color: inkColor,
      baseWidth: e.pointerType === 'pen' ? 2.2 + pt.pressure * 2.0 : 2.6,
    };

    redraw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentStrokeRef.current) return;
    e.preventDefault();

    const pt = getPointerPos(e);
    const pts = currentStrokeRef.current.points;
    const last = pts[pts.length - 1];

    // Throttle micro movements for ultra-smooth curve computation
    const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
    if (dist < 1.5) return;

    pts.push(pt);
    redraw();
  };

  const finishDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
      strokesRef.current.push(currentStrokeRef.current);
      currentStrokeRef.current = null;
      setStrokeCount(strokesRef.current.length);

      // Notify parent of updated data URL
      const canvas = canvasRef.current;
      if (canvas && onSignatureChange) {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          onSignatureChange(dataUrl);
        } catch (_) {}
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    finishDrawing();
  };

  const handlePointerCancel = () => {
    finishDrawing();
  };

  // Undo the last stroke
  const handleUndo = () => {
    if (strokesRef.current.length === 0) return;
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    setIsSavedLocal(false);
    setStatusMessage(null);
    redraw();

    const canvas = canvasRef.current;
    if (canvas && onSignatureChange) {
      onSignatureChange(strokesRef.current.length > 0 ? canvas.toDataURL('image/png') : '');
    }
  };

  // Clear all strokes
  const handleClear = async () => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    setStrokeCount(0);
    setIsSavedLocal(false);
    setStatusMessage(null);
    redraw();

    if (submissionUuid) await deleteCaregiverSignatureBlob(submissionUuid);
    if (fallbackUuid && fallbackUuid !== submissionUuid) await deleteCaregiverSignatureBlob(fallbackUuid);

    if (onSignatureCleared) onSignatureCleared();
    if (onSignatureChange) onSignatureChange('');
  };

  // Save signature to offline Dexie DB
  const handleSaveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || strokeCount === 0) {
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
        if (fallbackUuid && fallbackUuid !== submissionUuid) {
          await saveCaregiverSignatureBlob(
            fallbackUuid,
            blob,
            caregiverName || 'Caregiver',
            caregiverRelationship || 'Approved Caregiver'
          );
        }
        setIsSavedLocal(true);
        setStatusMessage('Signature captured & saved securely to offline database.');
        if (onSignatureSaved) onSignatureSaved(blob);
        if (onSignatureChange) onSignatureChange(canvas.toDataURL('image/png'));
      } catch (err) {
        console.error('Error saving signature Blob:', err);
        setStatusMessage('Error saving signature to local storage.');
      }
    }, 'image/png');
  };

  const hasContent = strokeCount > 0;

  return (
    <div ref={containerRef} className="bg-white rounded-2xl border border-black p-4 sm:p-5 shadow-xs space-y-3.5 select-none">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-purple-100 text-purple-700">
            <PenTool className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-900">Caregiver Digital Signature *</h3>
            <p className="text-[11px] text-slate-500">
              Sign smoothly inside the box using finger, stylus, or mouse.
            </p>
          </div>
        </div>

        {/* Signatory Metadata Badge */}
        <div className="inline-flex items-center space-x-1.5 bg-slate-50 border border-slate-300/80 px-2.5 py-1.5 rounded-xl text-xs whitespace-nowrap self-start sm:self-auto">
          <span className="text-slate-400 text-[10px] uppercase font-bold">Signatory:</span>
          <span className="font-bold text-slate-900">{caregiverName || 'Caregiver'}</span>
          <span className="text-slate-500 text-[11px]">({caregiverRelationship || 'Mother'})</span>
        </div>
      </div>

      {/* Advanced Interactive Canvas */}
      <div className="relative border-2 border-dashed border-slate-300 hover:border-purple-400 rounded-xl bg-[#FAFBFD] overflow-hidden touch-none transition-colors">
        <canvas
          ref={canvasRef}
          className="w-full h-[190px] sm:h-[210px] cursor-crosshair bg-transparent block"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />

        {/* Empty state prompt */}
        {!hasContent && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-400">
            <PenTool className="h-6 w-6 mb-1 opacity-30 animate-pulse" />
            <span className="text-xs font-semibold text-slate-400">Sign on the line above</span>
            <span className="text-[10px] text-slate-400 mt-0.5">High-precision cursor tracking active</span>
          </div>
        )}

        {/* Verified & Saved Badge */}
        {(isSavedLocal || externalIsSaved) && (
          <div className="absolute top-2.5 right-2.5 flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300/90 px-3 py-1 rounded-full text-[11px] font-bold shadow-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Signature Verified &amp; Saved</span>
          </div>
        )}

        {/* Ink Color Picker */}
        <div className="absolute bottom-2 left-2 flex items-center space-x-1.5 bg-white/90 backdrop-blur-xs border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-600 shadow-2xs">
          <span>Ink:</span>
          <button
            type="button"
            onClick={() => setInkColor('#0F172A')}
            title="Midnight Slate"
            className={`w-3.5 h-3.5 rounded-full bg-[#0F172A] transition-transform ${inkColor === '#0F172A' ? 'ring-2 ring-purple-500 scale-110' : 'opacity-70'}`}
          />
          <button
            type="button"
            onClick={() => setInkColor('#1E3A8A')}
            title="Royal Blue Ink"
            className={`w-3.5 h-3.5 rounded-full bg-[#1E3A8A] transition-transform ${inkColor === '#1E3A8A' ? 'ring-2 ring-purple-500 scale-110' : 'opacity-70'}`}
          />
        </div>
      </div>

      {/* Action Buttons Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!hasContent}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <Undo2 className="h-3.5 w-3.5 text-slate-500" />
            <span>Undo Stroke</span>
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={!hasContent}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl border border-slate-200 text-rose-700 bg-white hover:bg-rose-50 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            <span>Clear</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleSaveSignature}
          disabled={!hasContent}
          className={`inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
            isSavedLocal
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>{isSavedLocal ? 'Signature Confirmed' : 'Save & Confirm Signature'}</span>
        </button>
      </div>

      {/* Status Alert */}
      {statusMessage && (
        <p className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
          isSavedLocal
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-amber-50 text-amber-800 border border-amber-200'
        }`}>
          {statusMessage}
        </p>
      )}
    </div>
  );
}
