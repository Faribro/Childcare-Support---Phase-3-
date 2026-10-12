'use client';

import React, { useMemo } from 'react';
import { MapPin, Building2, ChevronDown, RotateCcw, Lock } from 'lucide-react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';

export const STATE_DISTRICTS_MAP: Record<string, string[]> = {
  'Maharashtra': [
    'Pune',
    'Mumbai Suburban',
    'Mumbai City',
    'Thane',
    'Solapur',
    'Nashik',
    'Nagpur',
    'Kolhapur',
    'Sangli',
    'Satara',
    'Aurangabad',
    'Amravati',
  ],
  'West Bengal': [
    'Kolkata',
    'Howrah',
    'Darjeeling',
    'North 24 Parganas',
    'South 24 Parganas',
    'Hooghly',
    'Nadia',
    'Murshidabad',
  ],
  'Delhi': [
    'Central Delhi',
    'East Delhi',
    'New Delhi',
    'North Delhi',
    'South Delhi',
    'West Delhi',
    'North East Delhi',
    'North West Delhi',
    'South East Delhi',
    'South West Delhi',
  ],
  'Karnataka': [
    'Bangalore Urban',
    'Bangalore Rural',
    'Mysore',
    'Belgaum',
    'Dharwad',
    'Mangalore',
  ],
  'Tamil Nadu': [
    'Chennai',
    'Coimbatore',
    'Madurai',
    'Tiruchirappalli',
    'Salem',
  ],
  'Gujarat': [
    'Ahmedabad',
    'Surat',
    'Vadodara',
    'Rajkot',
    'Bhavnagar',
  ],
  'Telangana': [
    'Hyderabad',
    'Rangareddy',
    'Warangal',
    'Medchal-Malkajgiri',
  ],
  'Uttar Pradesh': [
    'Lucknow',
    'Kanpur',
    'Varanasi',
    'Agra',
    'Prayagraj',
  ],
};

export interface StateDistrictFilterBarProps {
  selectedState: string;
  selectedDistrict: string;
  onStateChange: (state: string) => void;
  onDistrictChange: (district: string) => void;
  availableStates?: string[];
  availableDistricts?: string[];
  disabled?: boolean;
  className?: string;
}

export function StateDistrictFilterBar({
  selectedState,
  selectedDistrict,
  onStateChange,
  onDistrictChange,
  availableStates,
  availableDistricts,
  disabled = false,
  className = '',
}: StateDistrictFilterBarProps) {
  const { user } = useEvaluationAccess();

  // Determine user-scoped states
  const allowedUserStates = useMemo(() => {
    if (!user || !user.allowedStates || user.allowedStates.includes('*')) {
      return null; // Wildcard / unrestricted
    }
    return user.allowedStates;
  }, [user]);

  // Compute available states based on scoping and known map
  const stateOptions = useMemo(() => {
    const baseStates = availableStates && availableStates.length > 0
      ? Array.from(new Set([...Object.keys(STATE_DISTRICTS_MAP), ...availableStates]))
      : Object.keys(STATE_DISTRICTS_MAP);

    if (allowedUserStates) {
      return baseStates.filter((s) =>
        allowedUserStates.some((allowed) => allowed.toLowerCase() === s.toLowerCase())
      );
    }
    return baseStates;
  }, [availableStates, allowedUserStates]);

  // Compute cascading districts based on selected state
  const districtOptions = useMemo(() => {
    if (selectedState === 'ALL' || !selectedState) {
      if (availableDistricts && availableDistricts.length > 0) {
        return Array.from(new Set(availableDistricts));
      }
      return [];
    }

    const stateKey = Object.keys(STATE_DISTRICTS_MAP).find(
      (k) => k.toLowerCase() === selectedState.toLowerCase()
    );

    const knownDistricts = stateKey ? STATE_DISTRICTS_MAP[stateKey] : [];

    if (availableDistricts && availableDistricts.length > 0) {
      return Array.from(new Set([...knownDistricts, ...availableDistricts]));
    }

    return knownDistricts;
  }, [selectedState, availableDistricts]);

  const isStateLocked = Boolean(allowedUserStates && allowedUserStates.length === 1);

  const handleStateSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextState = e.target.value;
    onStateChange(nextState);
    onDistrictChange('ALL');
  };

  const handleDistrictSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onDistrictChange(e.target.value);
  };

  const handleReset = () => {
    if (!isStateLocked) {
      onStateChange('ALL');
    }
    onDistrictChange('ALL');
  };

  const hasFilterActive =
    (!isStateLocked && selectedState !== 'ALL') || selectedDistrict !== 'ALL';

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className}`}
      role="group"
      aria-label="State and District geographic filters"
    >
      {/* State Selector */}
      <div className="relative min-w-[140px] sm:min-w-[160px] flex-1 sm:flex-initial">
        <label htmlFor="state-filter-select" className="sr-only">
          Filter by State
        </label>
        <MapPin
          className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-colors ${
            selectedState !== 'ALL' ? 'text-teal-600' : 'text-slate-400'
          }`}
          aria-hidden="true"
        />
        <select
          id="state-filter-select"
          disabled={disabled || isStateLocked}
          value={selectedState}
          onChange={handleStateSelect}
          className={`w-full h-10 pl-9 pr-8 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-teal-500/30 font-medium transition-all appearance-none cursor-pointer disabled:opacity-80 disabled:cursor-not-allowed ${
            selectedState !== 'ALL'
              ? 'bg-teal-50/80 border-teal-300 text-teal-900 font-semibold shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100/60 border-slate-200 text-slate-700'
          }`}
          aria-label="Filter records by state"
        >
          {!allowedUserStates && <option value="ALL">All States</option>}
          {stateOptions.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        {isStateLocked ? (
          <Lock
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-teal-600 pointer-events-none"
            aria-label="State scope locked to your assignment"
          />
        ) : (
          <ChevronDown
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Cascading District Selector */}
      <div className="relative min-w-[140px] sm:min-w-[160px] flex-1 sm:flex-initial">
        <label htmlFor="district-filter-select" className="sr-only">
          Filter by District
        </label>
        <Building2
          className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-colors ${
            selectedDistrict !== 'ALL' ? 'text-teal-600' : 'text-slate-400'
          }`}
          aria-hidden="true"
        />
        <select
          id="district-filter-select"
          disabled={disabled}
          value={selectedDistrict}
          onChange={handleDistrictSelect}
          className={`w-full h-10 pl-9 pr-8 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-teal-500/30 font-medium transition-all appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
            selectedDistrict !== 'ALL'
              ? 'bg-teal-50/80 border-teal-300 text-teal-900 font-semibold shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100/60 border-slate-200 text-slate-700'
          }`}
          aria-label="Filter records by district"
        >
          <option value="ALL">All Districts</option>
          {districtOptions.map((dst) => (
            <option key={dst} value={dst}>
              {dst}
            </option>
          ))}
        </select>
        <ChevronDown
          className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none"
          aria-hidden="true"
        />
      </div>

      {/* Clear/Reset Trigger */}
      {hasFilterActive && (
        <button
          type="button"
          onClick={handleReset}
          className="h-10 px-2.5 text-xs font-medium text-slate-500 hover:text-slate-800 bg-slate-100/70 hover:bg-slate-200/70 rounded-xl transition-colors flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          title="Reset State and District filters"
          aria-label="Reset State and District filters"
        >
          <RotateCcw className="h-3 w-3 text-slate-500" />
          <span className="hidden sm:inline">Reset Area</span>
        </button>
      )}
    </div>
  );
}
