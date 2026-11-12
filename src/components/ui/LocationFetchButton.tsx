'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Navigation, AlertTriangle } from 'lucide-react';
import type { ReverseGeocodeResult, GeocodeTimings } from '@/app/api/geocode/reverse/route';

export interface LocationResult extends ReverseGeocodeResult {
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  quality: 'high' | 'moderate' | 'coarse';
  timings?: {
    gpsMs: number;
    provider: string;
    providerMs: number;
    totalMs: number;
  };
}

interface LocationFetchButtonProps {
  onLocationFetched: (result: LocationResult) => void;
  onProgressiveFill?: (partial: Partial<LocationResult>, stage: 'postal' | 'full') => void;
  disabled?: boolean;
  className?: string;
  hasExistingUserInput?: boolean;
  onConfirmOverwrite?: () => Promise<boolean>;
}

type FetchStatus = 'idle' | 'requesting' | 'geocoding' | 'confirm_coarse' | 'success' | 'error';

interface CachedGpsFix {
  pos: GeolocationPosition;
  timestamp: number;
}

export function LocationFetchButton({
  onLocationFetched,
  onProgressiveFill,
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
  const [timingInfo, setTimingInfo] = useState<string | null>(null);

  // Cached GPS fix from continuous background watchPosition on mount
  const latestGpsFixRef = useRef<CachedGpsFix | null>(null);
  const pendingPosRef = useRef<GeolocationPosition | null>(null);

  // ── 3. Start watchPosition on form mount (maximumAge: 60000, accuracy <= 100m) ──
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;

    let watchId: number | null = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          latestGpsFixRef.current = {
            pos,
            timestamp: Date.now(),
          };
        },
        (err) => {
          // Silent background watch error (e.g. permission prompt not yet answered)
        },
        {
          enableHighAccuracy: true,
          maximumAge: 60000, // 60s cache
          timeout: 15000,
        }
      );
    } catch (_) {}

    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  const executeServerGeocode = useCallback(
    async (pos: GeolocationPosition, accMeters: number, gpsDurationMs: number, clickStart: number) => {
      setStatus('geocoding');
      const geocodeFetchStart = Date.now();

      try {
        const res = await fetch('/api/geocode/reverse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        });

        const geocoderDurationMs = Date.now() - geocodeFetchStart;

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          setErrorMsg(
            errJson.error || 'Address lookup unavailable — please enter address fields manually.'
          );
          setStatus('error');
          return;
        }

        const json = await res.json();
        if (json?.fallback || !json?.success || !json?.data) {
          setErrorMsg(
            json?.error || 'Live address lookup unavailable — please enter address fields manually.'
          );
          setStatus('error');
          return;
        }

        const data: ReverseGeocodeResult = json.data;
        const serverTimings: GeocodeTimings | undefined = json.timings;
        const totalDurationMs = Date.now() - clickStart;

        // 1. Add timing logs for GPS, each provider, and total.
        console.info(
          `[TIMING:LIVE_ADDRESS] GPS=${gpsDurationMs}ms, Provider=${serverTimings?.provider || data.source} (${serverTimings?.providerMs ?? geocoderDurationMs}ms), Total=${totalDurationMs}ms`
        );

        // 5. Fill pincode/state/district first, then street/village when geocoder returns
        if (onProgressiveFill) {
          // Instant Phase 1: Postal / Region components
          onProgressiveFill(
            {
              pinCode: data.pinCode,
              state: data.state,
              district: data.district,
              talukMandalBlock: data.talukMandalBlock,
            },
            'postal'
          );

          // Phase 2: Microtask street/village detail
          setTimeout(() => {
            onProgressiveFill(
              {
                doorAndColony: data.doorAndColony,
                street: data.street,
                villageCity: data.villageCity,
                landmark: data.landmark,
                fullAddress: data.fullAddress,
              },
              'full'
            );
          }, 30);
        }

        const qual: 'high' | 'moderate' | 'coarse' =
          accMeters <= 50 ? 'high' : accMeters <= 100 ? 'moderate' : 'coarse';

        const result: LocationResult = {
          ...data,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: accMeters,
          quality: qual,
          timings: {
            gpsMs: gpsDurationMs,
            provider: serverTimings?.provider || data.source,
            providerMs: serverTimings?.providerMs ?? geocoderDurationMs,
            totalMs: totalDurationMs,
          },
        };

        onLocationFetched(result);
        setStatus('success');

        const detail = result.doorAndColony || result.villageCity || result.district || 'Address located';
        setLocatedDetail(detail);
        setTimingInfo(`${totalDurationMs}ms (GPS: ${gpsDurationMs}ms, Geo: ${serverTimings?.providerMs ?? geocoderDurationMs}ms)`);

        setTimeout(() => {
          setStatus('idle');
          setLocatedDetail(null);
          setTimingInfo(null);
        }, 7000);
      } catch (err: any) {
        setErrorMsg(err.message || 'Geocoding failed. Please enter address manually.');
        setStatus('error');
      }
    },
    [onLocationFetched, onProgressiveFill]
  );

  const handleFetch = useCallback(async () => {
    if (disabled) return;
    if (status === 'requesting' || status === 'geocoding') return;

    if (hasExistingUserInput && onConfirmOverwrite) {
      const confirmed = await onConfirmOverwrite();
      if (!confirmed) return;
    }

    setErrorMsg('');
    setAccuracy(null);
    setLocatedDetail(null);
    setTimingInfo(null);

    const clickStart = Date.now();
    let pos: GeolocationPosition | null = null;
    let gpsDurationMs = 0;

    // Check if background watchPosition has a fresh accurate fix (<= 60s old, accuracy <= 100m)
    const cachedFix = latestGpsFixRef.current;
    const now = Date.now();
    if (cachedFix && now - cachedFix.timestamp <= 60000 && cachedFix.pos.coords.accuracy <= 100) {
      pos = cachedFix.pos;
      gpsDurationMs = 0; // Instant 0ms GPS acquisition
      console.info(`[GPS:TIMING] Reusing background watchPosition fix (0ms, accuracy=±${Math.round(pos.coords.accuracy)}m)`);
    } else {
      setStatus('requesting');
      const gpsReqStart = Date.now();

      try {
        pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser.'));
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (position) => resolve(position),
            (err) => reject(err),
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 60000, // accept cached position up to 1 minute
            }
          );
        });
        gpsDurationMs = Date.now() - gpsReqStart;
        console.info(`[GPS:TIMING] Acquired fresh GPS fix in ${gpsDurationMs}ms (accuracy=±${Math.round(pos.coords.accuracy)}m)`);
      } catch (err: any) {
        const geoErr = err as GeolocationPositionError;
        const msg =
          geoErr.code === 1
            ? 'Location access denied. Please allow GPS permissions in browser.'
            : geoErr.code === 2
            ? 'GPS position unavailable. Please check device location settings.'
            : 'GPS fix timed out. Please retry with a clearer sky view.';
        setErrorMsg(msg);
        setStatus('error');
        return;
      }
    }

    const accMeters = Math.round(pos.coords.accuracy);
    setAccuracy(accMeters);

    if (accMeters <= 50) {
      setQuality('high');
    } else if (accMeters <= 100) {
      setQuality('moderate');
    } else {
      setQuality('coarse');
      pendingPosRef.current = pos;
      setStatus('confirm_coarse');
      return;
    }

    await executeServerGeocode(pos, accMeters, gpsDurationMs, clickStart);
  }, [disabled, status, hasExistingUserInput, onConfirmOverwrite, executeServerGeocode]);

  const handleConfirmCoarse = useCallback(() => {
    if (pendingPosRef.current && accuracy !== null) {
      executeServerGeocode(pendingPosRef.current, accuracy, 0, Date.now());
    }
  }, [accuracy, executeServerGeocode]);

  const handleCancelCoarse = useCallback(() => {
    pendingPosRef.current = null;
    setStatus('idle');
  }, []);

  const isLoading = status === 'requesting' || status === 'geocoding';

  return (
    // ── 7. Compact button: w-auto, right-aligned, small ──
    <div className={`flex flex-col items-end gap-1 ${className || ''}`}>
      <div className="flex items-center gap-2">
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
            inline-flex items-center justify-center gap-1.5 px-3 py-1.5 h-8 rounded-lg border font-bold text-xs
            transition-all duration-200 cursor-pointer select-none shadow-2xs whitespace-nowrap
            ${
              status === 'success'
                ? 'bg-emerald-600 border-emerald-700 text-white shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                : status === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
                : isLoading
                ? 'bg-indigo-50 border-indigo-300 text-indigo-900 animate-pulse'
                : 'bg-gradient-to-r from-teal-50 via-indigo-50 to-emerald-50 border-teal-300 text-teal-950 hover:bg-teal-100 hover:border-teal-400 active:scale-[0.98]'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-indigo-700" />
          ) : status === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-white" />
          ) : status === 'error' ? (
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
          ) : (
            <Navigation className="w-3.5 h-3.5 text-teal-700 shrink-0" />
          )}
          <span>
            {isLoading
              ? status === 'requesting'
                ? 'Fixing GPS…'
                : 'Resolving…'
              : status === 'success'
              ? 'Located!'
              : status === 'error'
              ? 'Retry'
              : 'Fetch Live Address'}
          </span>
        </button>
      </div>

      {/* Confirmation Dialog for Coarse GPS (>100m) */}
      {status === 'confirm_coarse' && (
        <div className="w-full max-w-xs p-2.5 bg-amber-50 border border-amber-300 rounded-xl flex flex-col gap-2 text-xs text-amber-950 animate-in fade-in">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Coarse GPS Accuracy (±{accuracy}m)</p>
              <p className="text-[11px] text-amber-800">
                Satellite fix accuracy is above 100m. Use detected location or fill manually?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end mt-1">
            <button
              type="button"
              onClick={handleCancelCoarse}
              className="px-2 py-0.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmCoarse}
              className="px-2 py-0.5 text-[11px] font-bold text-white bg-amber-700 rounded-md hover:bg-amber-800 cursor-pointer"
            >
              Use Location
            </button>
          </div>
        </div>
      )}

      {/* Accuracy & Timing Banner */}
      {status === 'success' && (
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium animate-fadeIn">
          <span className="text-emerald-700 font-bold truncate">✓ {locatedDetail || 'Located'}</span>
          {accuracy !== null && (
            <span className="font-mono text-slate-400">±{accuracy}m</span>
          )}
          {timingInfo && (
            <span className="font-mono text-teal-700 bg-teal-50 px-1 rounded border border-teal-200">
              {timingInfo}
            </span>
          )}
        </div>
      )}

      {/* Error Message */}
      {status === 'error' && errorMsg && (
        <p className="text-[10px] text-rose-600 font-medium text-right max-w-xs leading-tight">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
