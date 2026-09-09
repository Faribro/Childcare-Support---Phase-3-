'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Pause, Play, Languages, Sparkles } from 'lucide-react';
import { SUPPORTED_LANGUAGES, t } from '@/lib/i18n/translations';

interface ImmersiveReaderProps {
  currentLanguage: string;
  onLanguageChange: (lang: string) => void;
  activeReadingId: string | null;
  onReadingChange: (id: string | null) => void;
}

export interface ReadingItem {
  id: string;
  textKey: string;
}

export const FORM_READING_SEQUENCE: ReadingItem[] = [
  { id: 'sec-consent', textKey: 'sec_consent_full' },
  { id: 'q-consent-decision', textKey: 'consent_q' },
  { id: 'q-caregiver-name', textKey: 'caregiver_name' },
  { id: 'q-caregiver-rel', textKey: 'caregiver_relationship' },
  { id: 'q-caregiver-contact', textKey: 'caregiver_contact' },
  { id: 'q-caregiver-sig', textKey: 'caregiver_signature_sub' },

  { id: 'sec-child', textKey: 'sec_demographics_full' },
  { id: 'q-child-name', textKey: 'child_name' },
  { id: 'q-child-gender', textKey: 'gender' },
  { id: 'q-child-age', textKey: 'age' },
  { id: 'q-child-address', textKey: 'address' },
  { id: 'q-child-orphan', textKey: 'orphan_status' },

  { id: 'sec-banking', textKey: 'sec_banking_full' },
  { id: 'q-bank-holder', textKey: 'bank_acc_holder' },
  { id: 'q-bank-num', textKey: 'bank_acc_num' },
  { id: 'q-bank-ifsc', textKey: 'bank_ifsc' },

  { id: 'sec-household', textKey: 'sec_household_full' },
  { id: 'q-hh-members', textKey: 'hh_members' },
  { id: 'q-hh-children', textKey: 'hh_children' },
  { id: 'q-hh-income', textKey: 'hh_income' },
  { id: 'q-hh-source', textKey: 'hh_income_source' },

  { id: 'sec-health', textKey: 'sec_clinical_full' },
  { id: 'q-cli-weight', textKey: 'weight' },
  { id: 'q-cli-height', textKey: 'height' },
  { id: 'q-cli-bmi', textKey: 'bmi' },
  { id: 'q-cli-art-num', textKey: 'art_num' },
  { id: 'q-cli-vl', textKey: 'viral_load' },

  { id: 'sec-nutrition', textKey: 'sec_nutrition_full' },
  { id: 'q-nut-appetite', textKey: 'appetite' },
  { id: 'q-nut-meals', textKey: 'meals_per_day' },

  { id: 'sec-education', textKey: 'sec_education_full' },
  { id: 'q-edu-status', textKey: 'edu_status' },
  { id: 'q-edu-school', textKey: 'school_name' },
  { id: 'q-edu-class', textKey: 'current_class' },

  { id: 'sec-expenses', textKey: 'sec_expenses_full' },
  { id: 'sec-review', textKey: 'sec_review_full' },
  { id: 'q-rev-confirm', textKey: 'review_confirmed' },
  { id: 'q-rev-interviewer', textKey: 'interviewer_name' },
];

export function ImmersiveReaderControls({
  currentLanguage,
  onLanguageChange,
  activeReadingId,
  onReadingChange,
}: ImmersiveReaderProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const currentIndexRef = useRef(0);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const getSpeechVoice = (speechLang: string): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    const langPrefix = speechLang.split('-')[0].toLowerCase();
    
    // Exact match
    const exact = voices.find((v) => v.lang.toLowerCase() === speechLang.toLowerCase());
    if (exact) return exact;

    // Prefix match (e.g. 'hi' for 'hi-IN')
    const prefixMatch = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
    if (prefixMatch) return prefixMatch;

    return null;
  };

  const playItem = (index: number) => {
    if (!isPlayingRef.current) return;
    if (index >= FORM_READING_SEQUENCE.length) {
      // Completed reading whole form
      stopReading();
      return;
    }

    const item = FORM_READING_SEQUENCE[index];
    currentIndexRef.current = index;
    onReadingChange(item.id);

    // Smoothly scroll the highlighted element into viewport center
    const el = document.getElementById(item.id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const textToRead = t(item.textKey, currentLanguage);
    const langConfig = SUPPORTED_LANGUAGES.find((l) => l.code === currentLanguage);
    const speechLang = langConfig?.speechLang || 'en-IN';

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = speechLang;
    utterance.rate = 0.95; // Natural cadence

    const voice = getSpeechVoice(speechLang);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      if (isPlayingRef.current) {
        // Delay slightly before moving to next field for natural breath
        setTimeout(() => {
          if (isPlayingRef.current) {
            playItem(index + 1);
          }
        }, 350);
      }
    };

    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis error:', e);
      if (isPlayingRef.current) {
        playItem(index + 1);
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const startReading = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    isPlayingRef.current = true;
    setIsPlaying(true);
    setIsPaused(false);
    playItem(0);
  };

  const stopReading = () => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    currentIndexRef.current = 0;
    onReadingChange(null);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const pauseReading = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const resumeReading = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  };

  return (
    <div className="flex items-center flex-wrap gap-2 text-xs">
      {/* 1. Regional Languages Selector */}
      <div className="flex items-center space-x-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-2.5 py-1.5 shadow-2xs transition-colors">
        <Languages className="w-3.5 h-3.5 text-teal-700 shrink-0" />
        <select
          value={currentLanguage}
          onChange={(e) => {
            const nextLang = e.target.value;
            onLanguageChange(nextLang);
            if (isPlaying) {
              stopReading();
            }
          }}
          className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
          aria-label="Select Language"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code} className="bg-white text-slate-900 py-1">
              {lang.nativeName} ({lang.name})
            </option>
          ))}
        </select>
      </div>

      {/* 2. Immersive Audio Reader Controls */}
      <div className="flex items-center space-x-1">
        {!isPlaying ? (
          <button
            type="button"
            onClick={startReading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100/90 text-teal-900 font-bold border border-teal-200/90 shadow-2xs transition-all cursor-pointer group"
            title="Read aloud form with Medium-style text highlighting"
          >
            <Volume2 className="w-3.5 h-3.5 text-teal-700 group-hover:scale-110 transition-transform" />
            <span>{t('listen_btn', currentLanguage)}</span>
          </button>
        ) : (
          <div className="flex items-center space-x-1 bg-amber-50 border border-amber-200 rounded-xl p-0.5 shadow-2xs animate-in fade-in">
            {isPaused ? (
              <button
                type="button"
                onClick={resumeReading}
                className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-900 transition-colors"
                title="Resume reading"
              >
                <Play className="w-3.5 h-3.5 fill-amber-800 text-amber-800" />
              </button>
            ) : (
              <button
                type="button"
                onClick={pauseReading}
                className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-900 transition-colors"
                title="Pause reading"
              >
                <Pause className="w-3.5 h-3.5 fill-amber-800 text-amber-800" />
              </button>
            )}

            <button
              type="button"
              onClick={stopReading}
              className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] font-bold transition-colors"
              title="Stop immersive reader"
            >
              <VolumeX className="w-3 h-3 text-rose-700" />
              <span>{t('stop_btn', currentLanguage)}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
