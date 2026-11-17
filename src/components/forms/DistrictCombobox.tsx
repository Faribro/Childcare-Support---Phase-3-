'use client';

import React, { useState, useEffect, useRef, useId, useMemo } from 'react';
import { ChevronDown, Check, AlertCircle } from 'lucide-react';
import { UNVERIFIED_STATE_DISTRICTS } from '@/lib/constants/indianDistricts';

export const OTHER_DISTRICT_VALUE = '__other__';
export const OTHER_DISTRICT_LABEL = '+ Other / District not listed';

export interface DistrictComboboxProps {
  state?: string;
  selectedState?: string;
  value: string;
  onChange: (district: string) => void;
  error?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
}

export function DistrictCombobox({
  state,
  selectedState,
  value,
  onChange,
  error,
  id: propId,
  disabled = false,
  required = true,
}: DistrictComboboxProps) {
  const activeState = state || selectedState || '';
  const generatedId = useId();
  const comboboxId = propId || `district-combobox-${generatedId}`;
  const listboxId = `district-listbox-${generatedId}`;
  const otherInputId = `district-other-input-${generatedId}`;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOtherSelected, setIsOtherSelected] = useState(false);
  const [customDistrictName, setCustomDistrictName] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [stateChangeNotice, setStateChangeNotice] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  // Available districts for the selected state from the central dataset
  const districtsForState = useMemo(() => {
    if (!activeState) return [];
    return UNVERIFIED_STATE_DISTRICTS[activeState] || [];
  }, [activeState]);

  // Determine if incoming value is known in the state's list
  useEffect(() => {
    if (!value) {
      setIsOtherSelected(false);
      setCustomDistrictName('');
      return;
    }
    const isKnown = districtsForState.includes(value);
    if (!isKnown && value !== '') {
      setIsOtherSelected(true);
      setCustomDistrictName(value);
    } else {
      setIsOtherSelected(false);
    }
  }, [value, districtsForState]);

  // Reset district if state changes and previous district is incompatible
  const prevStateRef = useRef(activeState);
  useEffect(() => {
    if (prevStateRef.current && prevStateRef.current !== activeState) {
      if (value) {
        onChange('');
        setStateChangeNotice(
          `District selection reset because state changed from "${prevStateRef.current}" to "${activeState}".`
        );
      }
    }
    prevStateRef.current = activeState;
  }, [activeState, value, onChange]);

  // Filtered list based on search query
  const filteredDistricts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return districtsForState;
    return districtsForState.filter((d) => d.toLowerCase().includes(q));
  }, [districtsForState, searchQuery]);

  // Total selectable items = filtered districts + 1 ("Other" option)
  const totalOptions = filteredDistricts.length + 1;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectOption = (district: string) => {
    if (district === OTHER_DISTRICT_VALUE) {
      setIsOtherSelected(true);
      onChange(customDistrictName.trim() || 'Other');
      setSearchQuery('');
    } else {
      setIsOtherSelected(false);
      setCustomDistrictName('');
      onChange(district);
      setSearchQuery('');
    }
    setStateChangeNotice(null);
    setIsOpen(false);
  };

  const handleCustomNameChange = (name: string) => {
    setCustomDistrictName(name);
    onChange(name.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || !activeState) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % totalOptions);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + totalOptions) % totalOptions);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredDistricts.length) {
          handleSelectOption(filteredDistricts[highlightedIndex]);
        } else if (highlightedIndex === filteredDistricts.length) {
          handleSelectOption(OTHER_DISTRICT_VALUE);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  // Determine current display value for the combobox input
  const inputValue = useMemo(() => {
    if (isOpen) return searchQuery;
    if (isOtherSelected) {
      return customDistrictName ? `${customDistrictName} (Custom)` : OTHER_DISTRICT_LABEL;
    }
    return value || '';
  }, [isOpen, searchQuery, isOtherSelected, customDistrictName, value]);

  return (
    <div ref={containerRef} className="space-y-2">
      <label htmlFor={comboboxId} className="block text-xs font-semibold text-slate-700">
        Assigned District {required && <span className="text-rose-500">*</span>}
      </label>

      {/* State change notice banner */}
      {stateChangeNotice && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="flex-1">{stateChangeNotice}</span>
        </div>
      )}

      {/* Combobox Input with Dropdown */}
      <div className="relative">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            id={comboboxId}
            role="combobox"
            type="text"
            disabled={disabled || !activeState}
            placeholder={!activeState ? 'Select state first...' : 'Search or select district...'}
            value={inputValue}
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-label={`District selection for state ${activeState || 'none'}`}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => {
              if (!disabled && activeState) {
                setIsOpen(true);
                setSearchQuery('');
              }
            }}
            onKeyDown={handleKeyDown}
            className={`w-full min-h-[44px] px-3.5 pr-10 py-2.5 text-left text-sm rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
              disabled || !activeState
                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                : error
                ? 'bg-rose-50/60 border-rose-400 text-slate-900 ring-1 ring-rose-300'
                : isOpen
                ? 'bg-white border-teal-600 ring-2 ring-teal-500/20 shadow-xs'
                : 'bg-slate-50 hover:bg-white border-slate-300 text-slate-900'
            }`}
          />
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled || !activeState}
            onClick={() => {
              if (!disabled && activeState) {
                setIsOpen((prev) => !prev);
                if (!isOpen) {
                  setSearchQuery('');
                  inputRef.current?.focus();
                }
              }
            }}
            className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40"
            aria-hidden="true"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Dropdown Popover */}
        {isOpen && (
          <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            {/* Listbox */}
            <ul
              id={listboxId}
              ref={listboxRef}
              role="listbox"
              tabIndex={-1}
              aria-label={`Districts in ${activeState}`}
              className="max-h-60 overflow-y-auto py-1.5 text-sm divide-y divide-slate-50"
            >
              {filteredDistricts.length === 0 ? (
                <li className="px-4 py-3 text-xs text-slate-500 text-center">
                  No districts match &ldquo;{searchQuery}&rdquo;. You can use &ldquo;Other&rdquo; below.
                </li>
              ) : (
                filteredDistricts.map((district, idx) => {
                  const isSelected = value === district && !isOtherSelected;
                  const isHighlighted = idx === highlightedIndex;
                  return (
                    <li
                      key={district}
                      id={`district-opt-${idx}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectOption(district)}
                      className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer text-xs select-none min-h-[40px] transition-colors ${
                        isHighlighted
                          ? 'bg-teal-50 text-teal-900 font-semibold'
                          : isSelected
                          ? 'bg-teal-50/50 text-teal-800 font-medium'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{district}</span>
                      {isSelected && <Check className="w-4 h-4 text-teal-600 shrink-0" />}
                    </li>
                  );
                })
              )}

              {/* Always present "Other / District not listed" option */}
              <li
                id="district-opt-other"
                role="option"
                aria-selected={isOtherSelected}
                onClick={() => handleSelectOption(OTHER_DISTRICT_VALUE)}
                className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer text-xs select-none min-h-[40px] border-t border-slate-100 transition-colors ${
                  highlightedIndex === filteredDistricts.length
                    ? 'bg-amber-50 text-amber-950 font-bold'
                    : isOtherSelected
                    ? 'bg-amber-50/60 text-amber-900 font-semibold'
                    : 'text-slate-600 hover:bg-amber-50/40'
                }`}
              >
                <span className="italic flex items-center gap-1.5">
                  <span>{OTHER_DISTRICT_LABEL}</span>
                </span>
                {isOtherSelected && <Check className="w-4 h-4 text-amber-600 shrink-0" />}
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* When "Other / District not listed" is selected: reveal custom text field */}
      {isOtherSelected && (
        <div className="pt-1.5 animate-in fade-in duration-150">
          <label htmlFor={otherInputId} className="block text-xs font-semibold text-slate-700 mb-1">
            Enter district name <span className="text-rose-500">*</span>
          </label>
          <input
            id={otherInputId}
            type="text"
            required={required}
            value={customDistrictName}
            onChange={(e) => handleCustomNameChange(e.target.value)}
            placeholder="Enter district name as per official records"
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none transition-all"
            autoFocus
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Your custom district name will be preserved in your registration profile and survey records.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
