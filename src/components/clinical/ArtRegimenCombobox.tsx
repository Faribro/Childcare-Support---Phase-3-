'use client';

import React, { useState, useEffect, useRef, useId } from 'react';
import {
  ARTRegimen,
  NACO_ART_REGIMEN_CATALOGUE,
  searchRegimens,
  findRegimenByCodeOrName,
} from '@/lib/clinical/artRegimenCatalogue';
import { Search, ChevronDown, Check, AlertCircle, X } from 'lucide-react';

export interface ArtRegimenComboboxProps {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  disabledExplanation?: string;
  required?: boolean;
  label?: string;
  error?: string;
  helperText?: string;
  placeholder?: string;
}

export function ArtRegimenCombobox({
  id: explicitId,
  value = '',
  onChange,
  disabled = false,
  disabledExplanation,
  required = false,
  label = 'Type of ART Medicines (Regimen)',
  error,
  helperText,
  placeholder = 'Search by regimen name, abbreviation (e.g. TLD, pDTG, ABC+3TC)...',
}: ArtRegimenComboboxProps) {
  const generatedId = useId();
  const comboboxId = explicitId || `regimen-combobox-${generatedId}`;
  const listboxId = `${comboboxId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [otherSpecify, setOtherSpecify] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Check if current value matches a known catalogue regimen
  const matchedRegimen = findRegimenByCodeOrName(value);

  // Detect if current value is an "Other" specification
  const isOtherSelected =
    value.startsWith('Other:') ||
    value.startsWith('Other -') ||
    matchedRegimen?.code === 'OTHER' ||
    value === 'Other — specify' ||
    value === 'Other';

  useEffect(() => {
    if (isOtherSelected) {
      const match = value.match(/Other[:\-—]\s*(.*)$/i);
      if (match && match[1]) {
        setOtherSpecify(match[1]);
      }
    }
  }, [value, isOtherSelected]);

  // Filtered regimens based on user query
  const filteredRegimens = searchRegimens(searchQuery);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(0);
      } else {
        setActiveIndex((prev) => (prev < filteredRegimens.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(filteredRegimens.length - 1);
      } else {
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredRegimens.length - 1));
      }
    } else if (e.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && activeIndex < filteredRegimens.length) {
        e.preventDefault();
        selectRegimen(filteredRegimens[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const selectRegimen = (regimen: ARTRegimen) => {
    if (regimen.code === 'OTHER') {
      onChange(otherSpecify.trim() ? `Other: ${otherSpecify.trim()}` : 'Other — specify');
    } else {
      onChange(regimen.name);
    }
    setIsOpen(false);
    setSearchQuery('');
    setActiveIndex(-1);
  };

  const handleOtherSpecifyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const spec = e.target.value.slice(0, 200);
    setOtherSpecify(spec);
    onChange(spec.trim() ? `Other: ${spec.trim()}` : 'Other — specify');
  };

  const clearSelection = () => {
    onChange('');
    setSearchQuery('');
    setOtherSpecify('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  // Scroll active option into view
  useEffect(() => {
    if (isOpen && activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex, isOpen]);

  // Disabled state (e.g. Not on ART)
  if (disabled) {
    return (
      <div className="flex flex-col space-y-1.5 opacity-80" ref={containerRef}>
        <label htmlFor={comboboxId} className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-500 block">
          {label} {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        <div className="p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-600 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
            <span>{disabledExplanation || 'Not applicable while not on ART.'}</span>
          </div>
          {value && (
            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono truncate max-w-[200px]" title={value}>
              Retained: {value}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-1.5 relative" ref={containerRef}>
      <label htmlFor={comboboxId} className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-700 block">
        {label} {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>

      {/* Main Combobox Trigger / Search Input */}
      <div className="relative">
        <input
          ref={inputRef}
          id={comboboxId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${comboboxId}-opt-${activeIndex}` : undefined}
          aria-autocomplete="list"
          value={isOpen ? searchQuery : (value || '')}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => {
            setSearchQuery('');
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={value ? value : placeholder}
          className={`w-full min-h-[44px] h-11 pl-9 pr-16 text-xs sm:text-sm font-medium text-slate-900 bg-white border ${
            error ? 'border-rose-500 ring-1 ring-rose-300' : 'border-black hover:border-black'
          } rounded-xl shadow-2xs focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-600 transition-all cursor-text`}
        />

        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 pointer-events-none" />

        <div className="absolute right-2 top-2.5 flex items-center space-x-1">
          {value && (
            <button
              type="button"
              onClick={clearSelection}
              title="Clear selection"
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle options"
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Selected Value Confirmation / Custom Legacy Warning */}
      {value && !isOpen && (
        <div className="flex items-center justify-between text-[11px] text-slate-600 bg-purple-50/60 border border-purple-100 px-2.5 py-1.5 rounded-lg">
          <div className="flex items-center space-x-1.5 truncate">
            <span className="font-semibold text-purple-900">Selected Regimen:</span>
            <span className="font-medium truncate">{value}</span>
          </div>
          {matchedRegimen ? (
            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-purple-200 text-purple-900 shrink-0 ml-2">
              {matchedRegimen.line}
            </span>
          ) : (
            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0 ml-2">
              Legacy / Custom
            </span>
          )}
        </div>
      )}

      {/* Dropdown Listbox */}
      {isOpen && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className="absolute z-50 left-0 right-0 top-full mt-1 max-h-72 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-xl py-1 divide-y divide-slate-100 focus:outline-none"
        >
          {filteredRegimens.length === 0 ? (
            <li className="p-3 text-xs text-slate-500 text-center">
              No matching regimen found. Select &quot;Other — specify&quot; to enter a custom regimen.
            </li>
          ) : (
            filteredRegimens.map((regimen, index) => {
              const isSelected = value === regimen.name || matchedRegimen?.code === regimen.code;
              const isFocused = index === activeIndex;

              return (
                <li
                  key={regimen.code}
                  id={`${comboboxId}-opt-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input blur
                    selectRegimen(regimen);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`p-3 cursor-pointer text-xs transition-colors flex items-start justify-between gap-2 min-h-[44px] ${
                    isFocused ? 'bg-purple-50' : 'hover:bg-slate-50'
                  } ${isSelected ? 'bg-purple-100/70 font-semibold' : ''}`}
                >
                  <div className="flex flex-col space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <span className="font-bold text-slate-900">{regimen.name}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase tracking-wider ${
                          regimen.line.includes('Pediatric')
                            ? 'bg-emerald-100 text-emerald-800'
                            : regimen.line.includes('Second-line')
                            ? 'bg-amber-100 text-amber-800'
                            : regimen.line.includes('Third')
                            ? 'bg-rose-100 text-rose-800'
                            : regimen.code === 'OTHER' || regimen.code === 'UNKNOWN'
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {regimen.line}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">{regimen.description}</p>
                    <p className="text-[10px] text-slate-400 italic">Target: {regimen.targetPopulation}</p>
                  </div>

                  {isSelected && <Check className="w-4 h-4 text-purple-600 shrink-0 mt-1" />}
                </li>
              );
            })
          )}
        </ul>
      )}

      {/* "Other — specify" Bounded Text Input */}
      {isOtherSelected && (
        <div className="mt-2 p-3 bg-purple-50/50 border border-purple-200 rounded-xl space-y-1.5 animate-fadeIn">
          <label htmlFor={`${comboboxId}-specify`} className="text-[10px] font-black uppercase tracking-wider text-purple-900 block">
            Specify Prescribed ART Regimen <span className="text-rose-500">*</span>
          </label>
          <input
            id={`${comboboxId}-specify`}
            type="text"
            maxLength={200}
            value={otherSpecify}
            onChange={handleOtherSpecifyChange}
            placeholder="Document exact prescribed drugs, strengths, and formulation (e.g. DTG 50mg + FTC 200mg + TDF 300mg)"
            className="w-full h-10 px-3 text-xs sm:text-sm font-medium bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 text-slate-900"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Official NACO regimen documentation required.</span>
            <span>{otherSpecify.length}/200 characters</span>
          </div>
        </div>
      )}

      {/* Helper & Error text */}
      {error ? (
        <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-0.5">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      ) : helperText ? (
        <p className="text-[11px] text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
}
