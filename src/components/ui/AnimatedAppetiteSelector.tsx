'use client';

import React, { useEffect } from 'react';
import type { AppetiteLevel } from '@/types/domain';

interface AnimatedAppetiteSelectorProps {
  appetite: AppetiteLevel | '' | string;
  mealsPerDay: number | string;
  onAppetiteChange: (appetite: AppetiteLevel) => void;
  onMealsChange: (meals: number) => void;
  labels?: {
    appetiteTitle?: string;
    mealsTitle?: string;
    good?: string;
    reduced?: string;
    poor?: string;
  };
  highlightAppetiteClass?: string;
  highlightMealsClass?: string;
}

export function AnimatedAppetiteSelector({
  appetite,
  mealsPerDay,
  onAppetiteChange,
  onMealsChange,
  labels,
  highlightAppetiteClass = '',
  highlightMealsClass = '',
}: AnimatedAppetiteSelectorProps) {
  const numMeals = Number(mealsPerDay) || 0;

  // Automatically calculate appetite based on meals per day
  const handleMealsInput = (rawVal: string | number) => {
    const val = typeof rawVal === 'string' ? parseInt(rawVal, 10) : rawVal;
    const safeMeals = isNaN(val) ? 0 : Math.max(0, Math.min(10, val));
    onMealsChange(safeMeals);

    if (safeMeals > 0) {
      if (safeMeals >= 3) {
        onAppetiteChange('Good');
      } else if (safeMeals === 2) {
        onAppetiteChange('Reduced');
      } else {
        onAppetiteChange('Poor / Very low');
      }
    }
  };

  const APPETITE_OPTIONS: Array<{
    id: AppetiteLevel;
    label: string;
    sublabel: string;
    recommendedMeals: string;
    badgeColor: string;
    activeBorder: string;
    activeBg: string;
    activeRing: string;
  }> = [
    {
      id: 'Good',
      label: labels?.good || 'Good',
      sublabel: 'Hearty & healthy intake',
      recommendedMeals: '3+ meals / day',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      activeBorder: 'border-emerald-500',
      activeBg: 'bg-gradient-to-b from-emerald-50/90 to-lime-50/70',
      activeRing: 'ring-2 ring-emerald-400/50 shadow-[0_0_16px_rgba(16,185,129,0.25)]',
    },
    {
      id: 'Reduced',
      label: labels?.reduced || 'Reduced',
      sublabel: 'Partial appetite / fussy',
      recommendedMeals: '2 meals / day',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
      activeBorder: 'border-amber-500',
      activeBg: 'bg-gradient-to-b from-amber-50/90 to-yellow-50/70',
      activeRing: 'ring-2 ring-amber-400/50 shadow-[0_0_16px_rgba(245,158,11,0.25)]',
    },
    {
      id: 'Poor / Very low',
      label: labels?.poor || 'Poor / Very low',
      sublabel: 'Severe lack of intake',
      recommendedMeals: '0–1 meal / day',
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
      activeBorder: 'border-rose-500',
      activeBg: 'bg-gradient-to-b from-rose-50/90 to-red-50/70',
      activeRing: 'ring-2 ring-rose-400/50 shadow-[0_0_16px_rgba(244,63,94,0.25)]',
    },
  ];

  return (
    <div className="space-y-4">
      <style jsx>{`
        @keyframes happyBounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-4px) scale(1.04); }
        }
        @keyframes eyeBlink {
          0%, 92%, 100% { transform: scaleY(1); }
          96% { transform: scaleY(0.1); }
        }
        @keyframes tongueWag {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(8deg); }
        }
        @keyframes neutralSway {
          0%, 100% { transform: rotate(0deg); }
          30% { transform: rotate(-3deg); }
          70% { transform: rotate(3deg); }
        }
        @keyframes sadDroop {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(2px); }
        }
        @keyframes tearPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        .anim-happy { animation: happyBounce 2.4s ease-in-out infinite; }
        .anim-blink { animation: eyeBlink 3.8s infinite; transform-origin: center; }
        .anim-tongue { animation: tongueWag 1.8s ease-in-out infinite; transform-origin: top center; }
        .anim-sway { animation: neutralSway 3.2s ease-in-out infinite; transform-origin: center; }
        .anim-droop { animation: sadDroop 2.6s ease-in-out infinite; }
        .anim-tear { animation: tearPulse 2s ease-in-out infinite; }
      `}</style>

      {/* Grid: Meals Per Day + Appetite Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Meals Per Day Input Box with Quick Stepper Buttons */}
        <div
          id="q-nut-meals"
          className={`lg:col-span-4 p-4 rounded-2xl border border-lime-200 bg-white shadow-2xs space-y-3 ${highlightMealsClass}`}
        >
          <div className="flex items-center justify-between">
            <label className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-700 block">
              {labels?.mealsTitle || 'Meals Per Day'} <span className="text-rose-500 ml-0.5">*</span>
            </label>
            <span className="text-[10px] font-bold text-lime-700 bg-lime-100 px-2 py-0.5 rounded-full">
              Calculates appetite
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => handleMealsInput(Math.max(0, numMeals - 1))}
              aria-label="Decrease meals"
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg flex items-center justify-center transition-colors shrink-0 cursor-pointer select-none"
            >
              −
            </button>
            <input
              type="number"
              min="0"
              max="10"
              required
              value={mealsPerDay === 0 || mealsPerDay === '0' ? '0' : (mealsPerDay || '')}
              onChange={(e) => handleMealsInput(e.target.value)}
              placeholder="e.g. 3"
              className="w-full h-10 px-3 text-center text-lg font-black text-slate-900 bg-slate-50 border border-slate-300 focus:border-lime-500 focus:ring-2 focus:ring-lime-400/30 rounded-xl transition-all outline-none"
            />
            <button
              type="button"
              onClick={() => handleMealsInput(Math.min(10, numMeals + 1))}
              aria-label="Increase meals"
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg flex items-center justify-center transition-colors shrink-0 cursor-pointer select-none"
            >
              +
            </button>
          </div>

          {/* Quick preset buttons */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] font-semibold text-slate-400">Quick set:</span>
            <div className="flex space-x-1.5">
              {[1, 2, 3, 4].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleMealsInput(m)}
                  className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                    numMeals === m
                      ? 'bg-lime-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Child's Appetite Radio Cards with Animated Emojis */}
        <div
          id="q-nut-appetite"
          className={`lg:col-span-8 space-y-2 ${highlightAppetiteClass}`}
        >
          <div className="flex items-center justify-between">
            <label className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-700 block">
              {labels?.appetiteTitle || "Child's Appetite"} <span className="text-rose-500 ml-0.5">*</span>
            </label>
            {numMeals > 0 && (
              <span className="text-[10px] font-medium text-slate-500 flex items-center space-x-1">
                <span>Auto-computed from</span>
                <strong className="text-slate-800">{numMeals} meals/day</strong>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {APPETITE_OPTIONS.map((opt) => {
              const isSelected = appetite === opt.id;

              return (
                <div
                  key={opt.id}
                  onClick={() => onAppetiteChange(opt.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onAppetiteChange(opt.id)}
                  className={`relative flex flex-col p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                    isSelected
                      ? `${opt.activeBorder} ${opt.activeBg} ${opt.activeRing}`
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs'
                  }`}
                >
                  {/* Top row: Animated Emoji + Radio circle */}
                  <div className="flex items-center justify-between mb-2">
                    {/* Animated Emoji SVG */}
                    <div className="w-10 h-10 flex items-center justify-center">
                      {opt.id === 'Good' && (
                        <div className="anim-happy relative w-9 h-9">
                          <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-sm">
                            {/* Face Base */}
                            <circle cx="18" cy="18" r="16" fill="#FFCC4D" />
                            {/* Blushing cheeks */}
                            <circle cx="7" cy="21" r="3.5" fill="#FF7034" opacity="0.45" />
                            <circle cx="29" cy="21" r="3.5" fill="#FF7034" opacity="0.45" />
                            {/* Smiling curved eyes with blink */}
                            <g className="anim-blink">
                              <path d="M9 13c1.5-2.5 4.5-2.5 6 0" fill="none" stroke="#664500" strokeWidth="2.2" strokeLinecap="round" />
                              <path d="M21 13c1.5-2.5 4.5-2.5 6 0" fill="none" stroke="#664500" strokeWidth="2.2" strokeLinecap="round" />
                            </g>
                            {/* Smiling mouth */}
                            <path d="M11 20c0 4 3 7 7 7s7-3 7-7z" fill="#664500" />
                            {/* Tongue */}
                            <path d="M15 23.5c0 2 1.5 3.5 3 3.5s3-1.5 3-3.5z" fill="#DD2E44" className="anim-tongue" />
                          </svg>
                        </div>
                      )}

                      {opt.id === 'Reduced' && (
                        <div className="anim-sway relative w-9 h-9">
                          <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-sm">
                            {/* Face Base */}
                            <circle cx="18" cy="18" r="16" fill="#FFCC4D" />
                            {/* Neutral Eyes */}
                            <g className="anim-blink">
                              <circle cx="12" cy="14" r="2.2" fill="#664500" />
                              <circle cx="24" cy="14" r="2.2" fill="#664500" />
                            </g>
                            {/* Slight Pensive Eyebrow */}
                            <path d="M10 10.5c1.5-.5 3 0 4 .5" fill="none" stroke="#664500" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M22 11c1-.5 2.5-.5 4 0" fill="none" stroke="#664500" strokeWidth="1.5" strokeLinecap="round" />
                            {/* Straight Neutral Line Mouth */}
                            <line x1="12" y1="24" x2="24" y2="24" stroke="#664500" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        </div>
                      )}

                      {opt.id === 'Poor / Very low' && (
                        <div className="anim-droop relative w-9 h-9">
                          <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-sm">
                            {/* Face Base */}
                            <circle cx="18" cy="18" r="16" fill="#FFCC4D" />
                            {/* Sad angled Eyebrows */}
                            <path d="M10 11.5c1.5 1 3.5 1 5 0" fill="none" stroke="#664500" strokeWidth="1.6" strokeLinecap="round" />
                            <path d="M21 11.5c1.5 1 3.5 1 5 0" fill="none" stroke="#664500" strokeWidth="1.6" strokeLinecap="round" />
                            {/* Sad Eyes */}
                            <g className="anim-blink">
                              <circle cx="13" cy="15" r="2.2" fill="#664500" />
                              <circle cx="23" cy="15" r="2.2" fill="#664500" />
                            </g>
                            {/* Tear Drop */}
                            <path
                              d="M26 17.5c0 1.2-1 2-2 2s-2-.8-2-2c0-1.2 2-3 2-3s2 1.8 2 3z"
                              fill="#55ACEE"
                              className="anim-tear"
                            />
                            {/* Downward curved mouth */}
                            <path d="M12 26c1.5-3 4-4 6-4s4.5 1 6 4" fill="none" stroke="#664500" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Radio indicator */}
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-purple-600 bg-purple-600 ring-2 ring-purple-200'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="space-y-0.5">
                    <span
                      className={`text-xs font-bold block ${
                        isSelected ? 'text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="text-[10px] text-slate-500 block leading-tight">
                      {opt.sublabel}
                    </span>
                  </div>

                  {/* Rule Pill */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">
                      Standard
                    </span>
                    <span className="text-[9.5px] font-bold text-slate-600 bg-slate-100/80 px-1.5 py-0.5 rounded">
                      {opt.recommendedMeals}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}