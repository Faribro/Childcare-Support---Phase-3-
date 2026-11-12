'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Navigation, AlertTriangle } from 'lucide-react';
import type { ReverseGeocodeResult } from '@/app/api/geocode/reverse/route';

export interface LocationResult extends ReverseGeocodeResult {
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  quality: 'high' | 'moderate' | 'coarse';
}

interface LocationFetchButtonProps {
  onLocationFetched: (result: LocationResult) => void;
  disabled?: boolean;
  className?: string;
  hasExistingUserInput?: boolean;
  onConfirmOverwrite?: () => Promise<boolean>;
}

type FetchStatus = 'idle' | 'requesting' | 'geocoding' | 'confirm_coarse' | 'confirm_overwrite' | 'success' | 'error';

/**
 * Acquire GPS position using watchPosition with 30s timeout
 * Target accuracy <= 20m.
 * Always resolves with best fix after 30s timeout.
 * Never blocks worker from continuing.
 */
async function acquireGpsWithTieredAccuracy(
  timeoutMs = 30000,
  targetAccuracy = 20
): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser.');
  }

  return new Promise<GeolocationPosition>((resolve, reject) => {
    let bestPos: GeolocationPosition | null = null;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // 30-second timeout: resolve with best fix obtained so far
    timer = setTimeout(() => {
      cleanup();
      if (bestPos) {
        resolve(bestPos);
      } else {
        // Last-chance direct fix before rejecting
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }
    }, timeoutMs);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!bestPos || pos.coords.accuracy < bestPos.coords.accuracy) {
            bestPos = pos;
          }
          // Optimal accuracy threshold reached (<= 20m) -> lock immediately
          if (pos.coords.accuracy <= targetAccuracy) {
            cleanup();
            resolve(pos);
          }
        },
        (err) => {
          if (bestPos) {
            cleanup();
            resolve(bestPos);
          } else {
            cleanup();
            reject(err);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0,
        }
      );
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

export function LocationFetchButton({
  onLocationFetched,
  disabled,
  className,
  hasExistingUserInput,
  onConfirmOverwrite,
}: LocationFetchButtonProps) {
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [quality, setQuality] = useState<'high' | 'moderate' | 'coarse'>('high');
  const [locatedDetail, setLocatedDetail] = useState<string | null>(null);

  const pendingPosRef = useRef<GeolocationPosition | null>(null);

  const executeServerGeocode = useCallback(async (pos: GeolocationPosition, accMeters: number) => {
    setStatus('geocoding');
    try {
      const res = await fetch('/api/geocode/reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Server could not resolve address from coordinates.');
      }

      const { data } = await res.json();
      const qual: 'high' | 'moderate' | 'coarse' =
        accMeters <= 20 ? 'high' : accMeters <= 50 ? 'high' : accMeters <= 100 ? 'moderate' : 'coarse';

      const result: LocationResult = {
        ...data,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyMeters: accMeters,
        quality: qual,
      };

      onLocationFetched(result);
      setStatus('success');

      const detail = result.doorAndColony || result.villageCity || result.district || 'Address located';
      setLocatedDetail(detail);

      setTimeout(() => {
        setStatus('idle');
        setLocatedDetail(null);
      }, 8000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Geocoding failed. Please enter address manually.');
      setStatus('error');
    }
  }, [onLocationFetched]);

  const handleFetch = useCallback(async () => {
    if (disabled) return;
    if (status === 'requesting' || status === 'geocoding') return;

    // Check if user already typed content
    if (hasExistingUserInput && onConfirmOverwrite) {
      const confirmed = await onConfirmOverwrite();
      if (!confirmed) return;
    }

    setErrorMsg('');
    setAccuracy(null);
    setLocatedDetail(null);
    setStatus('requesting');

    let pos: GeolocationPosition;
    try {
      pos = await acquireGpsWithTieredAccuracy(30000, 20);
    } catch (err: any) {
      const geoErr = err as GeolocationPositionError;
      const msg =
        geoErr.code === 1
          ? 'Location access denied. Please allow GPS permissions in your browser.'
          : geoErr.code === 2
          ? 'GPS position unavailable. Please enable device location.'
          : 'GPS request timed out after 30 seconds. Please retry with a clearer sky view.';
      setErrorMsg(msg);
      setStatus('error');
      return;
    }

    const accMeters = Math.round(pos.coords.accuracy);
    setAccuracy(accMeters);

    if (accMeters <= 20) {
      setQuality('high');
    } else if (accMeters <= 50) {
      setQuality('high');
    } else if (accMeters <= 100) {
      setQuality('moderate');
    } else {
      setQuality('coarse');
      pendingPosRef.current = pos;
      setStatus('confirm_coarse');
      return;
    }

    await executeServerGeocode(pos, accMeters);
  }, [disabled, status, hasExistingUserInput, onConfirmOverwrite, executeServerGeocode]);

  const handleConfirmCoarse = useCallback(() => {
    if (pendingPosRef.current && accuracy !== null) {
      executeServerGeocode(pendingPosRef.current, accuracy);
    }
  }, [accuracy, executeServerGeocode]);

  const handleCancelCoarse = useCallback(() => {
    pendingPosRef.current = null;
    setStatus('idle');
  }, []);

  const isLoading = status === 'requesting' || status === 'geocoding';

  return (
    <div className={`w-full flex flex-col items-start gap-1.5 ${className || ''}`}>
      <div className="w-full flex items-stretch">
        <button
          type="button"
          onClick={handleFetch}
          disabled={disabled || isLoading}
          title={
            status === 'success' && accuracy !== null
              ? `GPS accuracy: ±${accuracy}m (${quality})`
              : 'Fetch live address from GPS'
          }
          className={`
            w-full h-11 px-4 rounded-xl border font-bold text-xs
            flex items-center justify-center gap-2
            transition-all duration-200 cursor-pointer select-none shadow-2xs
            ${
              status === 'success'
                ? 'bg-emerald-600 border-emerald-700 text-white shadow-[0_0_16px_rgba(16,185,129,0.4)]'
                : status === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
                : isLoading
                ? 'bg-indigo-50 border-indigo-300 text-indigo-900 animate-pulse'
                : 'bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border-indigo-300/90 text-indigo-950 hover:from-indigo-100 hover:to-purple-100 hover:border-indigo-400 active:scale-[0.98]'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-indigo-700" />
          ) : status === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />
          ) : status === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          ) : (
            <Navigation className="w-4 h-4 text-indigo-600 shrink-0" />
          )}
          <span className="truncate">
            {isLoading
              ? status === 'requesting'
                ? 'Acquiring GPS fix (up to 30s)…'
                : 'Resolving address via server…'
              : status === 'success'
              ? 'Address Located!'
              : status === 'error'
              ? 'Retry Live Address'
              : 'Fetch Live Address'}
          </span>
        </button>
      </div>

      {/* Confirmation Dialog for Coarse GPS (>100m) */}
      {status === 'confirm_coarse' && (
        <div className="w-full p-2.5 bg-amber-50 border border-amber-300 rounded-xl flex flex-col gap-2 text-xs text-amber-950 animate-in fade-in">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Coarse GPS Accuracy (±{accuracy}m)</p>
              <p className="text-[11px] text-amber-800">
                Satellite fix accuracy is above 100m. Would you like to use the detected location or fill the form manually?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end mt-1">
            <button
              type="button"
              onClick={handleCancelCoarse}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Fill Manually
            </button>
            <button
              type="button"
              onClick={handleConfirmCoarse}
              className="px-2.5 py-1 text-[11px] font-bold text-white bg-amber-700 rounded-lg hover:bg-amber-800 cursor-pointer"
            >
              Use Detected Location
            </button>
          </div>
        </div>
      )}

      {/* Accuracy Banner */}
      {status === 'success' && (
        <div className="w-full flex items-center justify-between px-1 text-[10.5px] font-semibold animate-fadeIn">
          <span className="text-emerald-800 truncate">✓ Located: {locatedDetail || 'Address'}</span>
          {accuracy !== null && (
            <span
              className={`shrink-0 px-1.5 py-0.5 rounded font-mono text-[9.5px] ${
                accuracy <= 50
                  ? 'bg-emerald-100 text-emerald-800'
                  : accuracy <= 100
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              ±{accuracy}m {accuracy > 50 && accuracy <= 100 ? '(Moderate fix)' : ''}
            </span>
          )}
        </div>
      )}

      {/* Error detail with retry */}
      {status === 'error' && errorMsg && (
        <div className="w-full flex items-center justify-between px-1">
          <p className="text-[10.5px] text-rose-600 font-medium">{errorMsg}</p>
          <button
            type="button"
            onClick={handleFetch}
            className="text-[10.5px] font-bold text-indigo-700 hover:underline cursor-pointer ml-2 shrink-0"
          >
            Retry Now →
          </button>
        </div>
      )}
    </div>
  );
}
