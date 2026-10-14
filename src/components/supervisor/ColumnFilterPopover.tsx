'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Filter,
  Search,
  X,
  Check,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from 'lucide-react';
import type { FacetOption } from './linelistFilterUtils';

export interface ColumnFilterSectionDef {
  id: string;
  title: string;
  options: FacetOption[];
  selectedValues: string[];
}

export interface ColumnFilterPopoverProps {
  columnId: string;
  columnTitle: string;
  sections: ColumnFilterSectionDef[];
  onApply: (selectionsBySection: Record<string, string[]>) => void;
  onClear: () => void;
  sortDirection?: 'asc' | 'desc' | null;
  onSortChange?: (direction: 'asc' | 'desc' | null) => void;
  className?: string;
}

export function ColumnFilterPopover({
  columnId,
  columnTitle,
  sections,
  onApply,
  onClear,
  sortDirection = null,
  onSortChange,
  className = '',
}: ColumnFilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string>(sections[0]?.id || '');
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [stagedSelections, setStagedSelections] = useState<Record<string, string[]>>({});

  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync staged selections whenever popover opens or prop sections change
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string[]> = {};
      sections.forEach((s) => {
        initial[s.id] = [...s.selectedValues];
      });
      setStagedSelections(initial);
      setActiveSectionId((prev) => prev || sections[0]?.id || '');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, sections]);

  // Total active selected count across all sections for this column
  const totalActiveCount = useMemo(() => {
    return sections.reduce((acc, s) => acc + s.selectedValues.length, 0);
  }, [sections]);

  const isFilterActive = totalActiveCount > 0;

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const activeSection = sections.find((s) => s.id === activeSectionId) || sections[0];
  const activeSearchQuery = (searchQueries[activeSection?.id || ''] || '').toLowerCase().trim();

  const filteredOptions = useMemo(() => {
    if (!activeSection) return [];
    if (!activeSearchQuery) return activeSection.options;
    return activeSection.options.filter((opt) =>
      opt.label.toLowerCase().includes(activeSearchQuery)
    );
  }, [activeSection, activeSearchQuery]);

  const currentStagedForSection = stagedSelections[activeSection?.id || ''] || [];

  const handleToggleOption = (val: string) => {
    if (!activeSection) return;
    const secId = activeSection.id;
    const prev = stagedSelections[secId] || [];
    const next = prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val];
    setStagedSelections((all) => ({ ...all, [secId]: next }));
  };

  const handleSelectAllVisible = () => {
    if (!activeSection) return;
    const secId = activeSection.id;
    const prev = new Set(stagedSelections[secId] || []);
    filteredOptions.forEach((opt) => prev.add(opt.value));
    setStagedSelections((all) => ({ ...all, [secId]: Array.from(prev) }));
  };

  const handleDeselectAllVisible = () => {
    if (!activeSection) return;
    const secId = activeSection.id;
    const visibleValues = new Set(filteredOptions.map((opt) => opt.value));
    const next = (stagedSelections[secId] || []).filter((v) => !visibleValues.has(v));
    setStagedSelections((all) => ({ ...all, [secId]: next }));
  };

  const handleClearSection = () => {
    if (!activeSection) return;
    setStagedSelections((all) => ({ ...all, [activeSection.id]: [] }));
  };

  const handleApply = () => {
    onApply(stagedSelections);
    setIsOpen(false);
  };

  const handleClearAll = () => {
    const cleared: Record<string, string[]> = {};
    sections.forEach((s) => {
      cleared[s.id] = [];
    });
    setStagedSelections(cleared);
    onClear();
    setIsOpen(false);
  };

  const handleSortClick = (direction: 'asc' | 'desc') => {
    if (!onSortChange) return;
    if (sortDirection === direction) {
      onSortChange(null);
    } else {
      onSortChange(direction);
    }
  };

  return (
    <div className={`relative inline-flex items-center ${className}`} ref={popoverRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Filter and sort ${columnTitle}${isFilterActive ? ` (${totalActiveCount} active)` : ''}`}
        title={`Filter ${columnTitle}${isFilterActive ? ` (${totalActiveCount} active)` : ''}`}
        className={`ml-1.5 p-1 rounded-md transition-all inline-flex items-center justify-center cursor-pointer ${
          isFilterActive
            ? 'bg-teal-600 text-white shadow-2xs hover:bg-teal-700'
            : sortDirection
            ? 'bg-teal-100 text-teal-800 hover:bg-teal-200'
            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
        }`}
      >
        <Filter className="h-3 w-3 shrink-0" />
        {isFilterActive && (
          <span className="ml-0.5 text-[9px] font-extrabold px-1 py-0.2 rounded-full bg-white text-teal-800 leading-none">
            {totalActiveCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={`${columnTitle} filter options`}
          className="absolute left-0 top-full mt-1.5 w-64 sm:w-72 rounded-2xl bg-white shadow-2xl border border-slate-200 z-50 text-slate-800 focus:outline-none animate-in fade-in zoom-in-95 duration-100 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-3 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 truncate">
              Filter: {columnTitle}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors"
              aria-label="Close filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Sort Toolbar (if sorting is enabled) */}
          {onSortChange && (
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between text-xs bg-white">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Sort Column:
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSortClick('asc')}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                    sortDirection === 'asc'
                      ? 'bg-teal-100 text-teal-900 border border-teal-300'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                  }`}
                  title="Sort Ascending"
                >
                  <ArrowUp className="h-3 w-3" />
                  <span>Asc</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSortClick('desc')}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                    sortDirection === 'desc'
                      ? 'bg-teal-100 text-teal-900 border border-teal-300'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                  }`}
                  title="Sort Descending"
                >
                  <ArrowDown className="h-3 w-3" />
                  <span>Desc</span>
                </button>
              </div>
            </div>
          )}

          {/* Multi-Section Tabs if > 1 section */}
          {sections.length > 1 && (
            <div className="flex border-b border-slate-200 bg-slate-100/60 p-1 gap-1 text-xs">
              {sections.map((sec) => {
                const count = (stagedSelections[sec.id] || []).length;
                const isSelected = sec.id === activeSectionId;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setActiveSectionId(sec.id)}
                    className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold text-center transition-all truncate cursor-pointer ${
                      isSelected
                        ? 'bg-white text-teal-900 shadow-xs border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>{sec.title}</span>
                    {count > 0 && (
                      <span className="ml-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-teal-100 text-teal-800">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Search within available values */}
          <div className="p-2.5 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={`Search ${activeSection?.title || 'values'}...`}
                value={searchQueries[activeSection?.id || ''] || ''}
                onChange={(e) =>
                  setSearchQueries((prev) => ({
                    ...prev,
                    [activeSection?.id || '']: e.target.value,
                  }))
                }
                className="w-full h-8 pl-8 pr-7 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 transition-all font-medium text-slate-800"
              />
              {(searchQueries[activeSection?.id || ''] || '') && (
                <button
                  type="button"
                  onClick={() =>
                    setSearchQueries((prev) => ({
                      ...prev,
                      [activeSection?.id || '']: '',
                    }))
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Quick Actions: Select All Matching / Clear */}
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 font-medium px-0.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="text-teal-700 hover:text-teal-900 font-semibold hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleDeselectAllVisible}
                  className="hover:text-slate-800 hover:underline cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
              {currentStagedForSection.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSection}
                  className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Checkbox Options List */}
          <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5 divide-y divide-slate-50">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No matching options found
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isChecked = currentStagedForSection.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                      isChecked
                        ? 'bg-teal-50/70 text-teal-950 font-semibold'
                        : opt.count === 0
                        ? 'text-slate-400 hover:bg-slate-50'
                        : 'text-slate-700 hover:bg-slate-100/70 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate mr-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleOption(opt.value)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-500/30 cursor-pointer"
                      />
                      <span className="truncate">{opt.label}</span>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        opt.count > 0
                          ? isChecked
                            ? 'bg-teal-200/80 text-teal-900'
                            : 'bg-slate-100 text-slate-600'
                          : 'bg-slate-100/60 text-slate-400'
                      }`}
                    >
                      {opt.count}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Footer Controls: Clear All, Cancel, Apply */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs text-slate-500 hover:text-rose-600 font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              title="Reset all filters on this column"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="px-3 py-1 text-xs font-bold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-xs transition-all cursor-pointer flex items-center gap-1"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Apply</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
