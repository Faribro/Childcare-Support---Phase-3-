'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, VolumeX, Pause, Play, Languages, Mic, MicOff } from 'lucide-react';
import { SUPPORTED_LANGUAGES, t } from '@/lib/i18n/translations';

interface ImmersiveReaderProps {
  currentLanguage: string;
  onLanguageChange: (lang: string) => void;
  activeReadingId: string | null;
  onReadingChange: (id: string | null) => void;
  formData?: Record<string, unknown>;
  hasSavedSignature?: boolean;
}

export interface ReadingItem {
  id: string;
  textKey: string;
  isFilled?: (fd: Record<string, unknown>, sig: boolean) => boolean;
}

const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const num = (v: unknown) => typeof v === 'number' && !isNaN(v) && v > 0;
const bool = (v: unknown) => v === true || v === false;

export const FORM_READING_SEQUENCE: ReadingItem[] = [
  { id: 'sec-consent',      textKey: 'sec_consent_full' },
  { id: 'q-consent-decision', textKey: 'consent_q',
    isFilled: (fd) => bool(fd.agreeToParticipate) },
  { id: 'q-caregiver-name',  textKey: 'caregiver_name',
    isFilled: (fd) => str(fd.caregiverName) },
  { id: 'q-caregiver-rel',   textKey: 'caregiver_relationship',
    isFilled: (fd) => str(fd.caregiverRelationship) },
  { id: 'q-caregiver-contact', textKey: 'caregiver_contact',
    isFilled: (fd) => {
      const v = fd.contactNumber ?? fd.caregiverContactNumber;
      return typeof v === 'string' && v.replace(/\D/g, '').length >= 10;
    }},
  { id: 'q-caregiver-sig',   textKey: 'caregiver_signature_sub',
    isFilled: (_fd, sig) => sig },

  { id: 'sec-child',        textKey: 'sec_demographics_full' },
  { id: 'q-child-name',     textKey: 'child_name',
    isFilled: (fd) => str(fd.childName) },
  { id: 'q-child-gender',   textKey: 'gender',
    isFilled: (fd) => str(fd.gender) },
  { id: 'q-child-age',      textKey: 'age',
    isFilled: (fd) => str(fd.dob) || num(Number(fd.ageYears)) },
  { id: 'q-child-address',  textKey: 'address',
    isFilled: (fd) => str(fd.fullAddress) },
  { id: 'q-child-orphan',   textKey: 'orphan_status',
    isFilled: (fd) => str(fd.orphanStatus) },

  { id: 'sec-banking',      textKey: 'sec_banking_full' },
  { id: 'q-bank-holder',    textKey: 'bank_acc_holder',
    isFilled: (fd) => str(fd.bankAccountHolderName) },
  { id: 'q-bank-num',       textKey: 'bank_acc_num',
    isFilled: (fd) => str(fd.bankAccountNumber) },
  { id: 'q-bank-ifsc',      textKey: 'bank_ifsc',
    isFilled: (fd) => str(fd.bankIfscCode) },

  { id: 'sec-household',    textKey: 'sec_household_full' },
  { id: 'q-hh-members',     textKey: 'hh_members',
    isFilled: (fd) => num(fd.totalFamilyMembers as number) },
  { id: 'q-hh-children',    textKey: 'hh_children',
    isFilled: (fd) => typeof fd.numberOfChildrenUnder18 === 'number' },
  { id: 'q-hh-income',      textKey: 'hh_income',
    isFilled: (fd) => typeof fd.monthlyIncomeRs === 'number' && (fd.monthlyIncomeRs as number) >= 0 },
  { id: 'q-hh-source',      textKey: 'hh_income_source',
    isFilled: (fd) => str(fd.mainSourceOfIncome) },

  { id: 'sec-health',       textKey: 'sec_clinical_full' },
  { id: 'q-cli-weight',     textKey: 'weight',
    isFilled: (fd) => num(fd.weightKg as number) },
  { id: 'q-cli-height',     textKey: 'height',
    isFilled: (fd) => num(fd.heightCm as number) },
  { id: 'q-cli-bmi',        textKey: 'bmi',
    isFilled: (fd) => num(fd.weightKg as number) && num(fd.heightCm as number) },
  { id: 'q-cli-art-num',    textKey: 'art_num',
    isFilled: (fd) => str(fd.artIdNumber) },
  { id: 'q-cli-vl',         textKey: 'viral_load',
    isFilled: (fd) => str(fd.viralLoad) || str(fd.vlStatus) },

  { id: 'sec-nutrition',    textKey: 'sec_nutrition_full' },
  { id: 'q-nut-appetite',   textKey: 'appetite',
    isFilled: (fd) => str(fd.appetite) },
  { id: 'q-nut-meals',      textKey: 'meals_per_day',
    isFilled: (fd) => num(fd.mealsPerDay as number) },

  { id: 'sec-education',    textKey: 'sec_education_full' },
  { id: 'q-edu-status',     textKey: 'edu_status',
    isFilled: (fd) => str(fd.educationStatus) },
  { id: 'q-edu-school',     textKey: 'school_name',
    isFilled: (fd) => str(fd.schoolName) || str(fd.educationStatus) },
  { id: 'q-edu-class',      textKey: 'current_class',
    isFilled: (fd) => str(fd.currentClass) },

  { id: 'sec-expenses',     textKey: 'sec_expenses_full' },
  { id: 'sec-review',       textKey: 'sec_review_full' },
  { id: 'q-rev-confirm',    textKey: 'review_confirmed',
    isFilled: (fd) => fd.allInfoCorrect === true },
  { id: 'q-rev-interviewer', textKey: 'interviewer_name',
    isFilled: (fd) => str(fd.formSubmittedBy) },
];

export function ImmersiveReaderControls({
  currentLanguage,
  onLanguageChange,
  activeReadingId,
  onReadingChange,
  formData,
  hasSavedSignature = false,
}: ImmersiveReaderProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLiveGuide, setIsLiveGuide] = useState(false);
  const [liveActiveId, setLiveActiveId] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);

  const currentIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const isLiveGuideRef = useRef(false);
  const liveActiveIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFormDataRef = useRef<Record<string, unknown>>({});

  useEffect(() => { isLiveGuideRef.current = isLiveGuide; }, [isLiveGuide]);
  useEffect(() => { liveActiveIdRef.current = liveActiveId; }, [liveActiveId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    return () => { window.speechSynthesis.cancel(); };
  }, []);

  const sanitizeSpeechText = useCallback((rawText: string, lang: string): string => {
    if (!rawText) return '';
    let c = rawText;
    c = c.replace(/[*]+/g, '');
    if (lang === 'en') {
      c = c
        .replace(/\(INFORMED CONSENT\)/gi, '')
        .replace(/\(AUTO-GENERATED\)/gi, '')
        .replace(/\(KYC\)/gi, 'K Y C')
        .replace(/\(BMI\)/gi, 'Body Mass Index')
        .replace(/\(MUAC\s*CM\)/gi, 'M U A C in centimeters')
        .replace(/\(=<18\s*YRS\)/gi, '18 years and under')
        .replace(/\(RS\.?\)/gi, 'in rupees')
        .replace(/\(COPIES\/ML\)/gi, 'copies per milliliter')
        .replace(/\(YEARS\)/gi, 'in years')
        .replace(/\(CASTE\)/gi, '')
        .replace(/\bDOB\b/g, 'Date of Birth')
        .replace(/\bART\b/g, 'A R T')
        .replace(/\bVL\b/g, 'Viral Load')
        .replace(/\bIFSC\b/g, 'I F S C')
        .replace(/\bUID\b/g, 'Beneficiary ID')
        .replace(/\bHH\b/g, 'Household')
        .replace(/\bNo of\b/gi, 'Number of')
        .replace(/\bNO\b/g, 'Number')
        .replace(/\bSEC\b/gi, 'Section');
    }
    c = c.replace(/[()[\]{}]/g, ' ');
    c = c.replace(/\s*[—–]\s*/g, ', ').replace(/\s*\/\s*/g, ' or ');
    if (lang === 'en' && c === c.toUpperCase() && c.length > 3) {
      c = c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
    }
    return c.replace(/\s+/g, ' ').trim();
  }, []);

  const getSpeechVoice = useCallback((speechLang: string): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices?.length) return null;
    const prefix = speechLang.split('-')[0].toLowerCase();
    const matching = voices.filter(v =>
      v.lang.toLowerCase() === speechLang.toLowerCase() ||
      v.lang.toLowerCase().startsWith(prefix)
    );
    if (!matching.length) return null;
    return (
      matching.find(v => /natural|neural|online|enhanced|premium/i.test(v.name)) ||
      matching.find(v => /google|microsoft/i.test(v.name)) ||
      matching[0]
    );
  }, []);

  const speak = useCallback((text: string, lang: string, onEnd?: () => void) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === lang);
    const speechLang = langConfig?.speechLang || 'en-IN';
    const clean = sanitizeSpeechText(text, lang);
    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = speechLang;
    utterance.rate = 0.9;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;
    const voice = getSpeechVoice(speechLang);
    if (voice) utterance.voice = voice;
    if (onEnd) utterance.onend = onEnd;
    utterance.onerror = () => onEnd?.();
    window.speechSynthesis.speak(utterance);
  }, [sanitizeSpeechText, getSpeechVoice]);

  const guideToQuestion = useCallback((id: string) => {
    const item = FORM_READING_SEQUENCE.find(i => i.id === id);
    if (!item) return;
    setLiveActiveId(id);
    onReadingChange(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    speak(t(item.textKey, currentLanguage), currentLanguage);
  }, [currentLanguage, onReadingChange, speak]);

  const findNextUnfilled = useCallback((
    afterId: string | null,
    fd: Record<string, unknown>,
    sig: boolean
  ): string | null => {
    const startIdx = afterId
      ? FORM_READING_SEQUENCE.findIndex(i => i.id === afterId) + 1
      : 0;
    for (let i = startIdx; i < FORM_READING_SEQUENCE.length; i++) {
      const item = FORM_READING_SEQUENCE[i];
      if (!item.isFilled) continue;
      if (!item.isFilled(fd, sig)) return item.id;
    }
    return null;
  }, []);

  useEffect(() => {
    if (!isLiveGuide || !formData) return;
    const changed: string[] = [];
    for (const key of Object.keys(formData)) {
      if (JSON.stringify(formData[key]) !== JSON.stringify(prevFormDataRef.current[key])) {
        changed.push(key);
      }
    }
    prevFormDataRef.current = { ...formData };
    const activeItem = liveActiveId
      ? FORM_READING_SEQUENCE.find(i => i.id === liveActiveId)
      : null;
    if (!activeItem?.isFilled) return;
    if (!activeItem.isFilled(formData, hasSavedSignature)) return;
    const textInputs = ['caregiverName','childName','contactNumber','fullAddress',
      'bankAccountHolderName','bankAccountNumber','bankIfscCode','artIdNumber','formSubmittedBy'];
    const delay = changed.some(k => textInputs.includes(k)) ? 700 : 250;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!isLiveGuideRef.current) return;
      const next = findNextUnfilled(liveActiveIdRef.current, formData, hasSavedSignature);
      if (next) {
        guideToQuestion(next);
      } else {
        setAllDone(true);
        onReadingChange(null);
        setLiveActiveId(null);
        speak(
          currentLanguage === 'en'
            ? 'Excellent! All fields are complete. Please tap Submit Survey to finish.'
            : 'All fields complete. Please submit.',
          currentLanguage
        );
        const submitBtn = document.getElementById('btn-submit-survey');
        if (submitBtn) {
          submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          submitBtn.classList.add('ring-4', 'ring-purple-400');
          setTimeout(() => submitBtn.classList.remove('ring-4', 'ring-purple-400'), 4000);
        }
      }
    }, delay);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [formData, hasSavedSignature, isLiveGuide, liveActiveId, guideToQuestion, findNextUnfilled, currentLanguage, onReadingChange, speak]);

  useEffect(() => {
    if (!isLiveGuide) return;
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      let el: HTMLElement | null = target;
      while (el) {
        if (el.id?.startsWith('q-')) {
          if (el.id !== liveActiveIdRef.current) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            guideToQuestion(el.id);
          }
          break;
        }
        el = el.parentElement;
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [isLiveGuide, guideToQuestion]);

  const stopLiveGuide = useCallback(() => {
    setIsLiveGuide(false);
    setLiveActiveId(null);
    onReadingChange(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, [onReadingChange]);

  const startLiveGuide = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in your browser.');
      return;
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
    setAllDone(false);
    setIsLiveGuide(true);
    const fd = formData || {};
    const first = findNextUnfilled(null, fd, hasSavedSignature);
    if (first) {
      guideToQuestion(first);
    } else {
      setAllDone(true);
      speak('All fields are already complete. You can submit now!', currentLanguage);
    }
  }, [formData, hasSavedSignature, findNextUnfilled, guideToQuestion, speak, currentLanguage]);

  const playItem = useCallback((index: number) => {
    if (!isPlayingRef.current) return;
    if (index >= FORM_READING_SEQUENCE.length) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsPaused(false);
      currentIndexRef.current = 0;
      onReadingChange(null);
      return;
    }
    const item = FORM_READING_SEQUENCE[index];
    currentIndexRef.current = index;
    onReadingChange(item.id);
    document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    speak(t(item.textKey, currentLanguage), currentLanguage, () => {
      if (isPlayingRef.current) setTimeout(() => { if (isPlayingRef.current) playItem(index + 1); }, 400);
    });
  }, [currentLanguage, onReadingChange, speak]);

  const startReading = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) { alert('TTS not supported.'); return; }
    if (isLiveGuide) stopLiveGuide();
    window.speechSynthesis.cancel();
    isPlayingRef.current = true;
    setIsPlaying(true);
    setIsPaused(false);
    playItem(0);
  }, [isLiveGuide, stopLiveGuide, playItem]);

  const stopReading = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    currentIndexRef.current = 0;
    onReadingChange(null);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, [onReadingChange]);

  const pauseReading = () => { if (typeof window !== 'undefined' && 'speechSynthesis' in window) { window.speechSynthesis.pause(); setIsPaused(true); } };
  const resumeReading = () => { if (typeof window !== 'undefined' && 'speechSynthesis' in window) { window.speechSynthesis.resume(); setIsPaused(false); } };

  return (
    <div className="flex items-center flex-wrap gap-2 text-xs">
      <div className="flex items-center space-x-1.5 bg-white border border-black rounded-xl px-2.5 py-1.5 shadow-2xs">
        <Languages className="w-3.5 h-3.5 text-purple-700 shrink-0" />
        <select
          value={currentLanguage}
          onChange={(e) => { onLanguageChange(e.target.value); if (isPlaying) stopReading(); if (isLiveGuide) stopLiveGuide(); }}
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

      <button
        type="button"
        onClick={isLiveGuide ? stopLiveGuide : startLiveGuide}
        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border font-bold transition-all shadow-2xs group ${
          isLiveGuide
            ? 'bg-purple-600 border-purple-700 text-white shadow-[0_0_16px_rgba(147,51,234,0.45)]'
            : allDone
            ? 'bg-emerald-50 border-emerald-400 text-emerald-800 hover:bg-emerald-100'
            : 'bg-purple-50 hover:bg-purple-100/90 text-purple-950 border-purple-200'
        }`}
        title={isLiveGuide ? 'Stop Live Guide' : 'Live field-by-field voice guide'}
      >
        {isLiveGuide && (
          <span className="flex items-end space-x-px">
            {[4, 7, 5, 9, 6].map((h, i) => (
              <span key={i} className="w-0.5 bg-white/90 rounded-full inline-block"
                style={{ height: `${h}px`, animation: `lgsw 0.7s ease-in-out ${i*0.12}s infinite alternate` }} />
            ))}
          </span>
        )}
        {allDone && !isLiveGuide ? (
          <span className="flex items-center space-x-1"><span>?</span><span>All Done</span></span>
        ) : isLiveGuide ? (
          <><MicOff className="w-3.5 h-3.5" /><span>Stop Guide</span></>
        ) : (
          <><Mic className="w-3.5 h-3.5 text-purple-700 group-hover:scale-110 transition-transform" /><span>Live Guide</span></>
        )}
      </button>

      <div className="flex items-center space-x-1">
        {!isPlaying ? (
          <button type="button" onClick={startReading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 shadow-2xs transition-all cursor-pointer group"
            title="Read all form questions aloud">
            <Volume2 className="w-3.5 h-3.5 text-slate-500 group-hover:scale-110 transition-transform" />
            <span>{t('listen_btn', currentLanguage)}</span>
          </button>
        ) : (
          <div className="flex items-center space-x-1 bg-amber-50 border border-amber-200 rounded-xl p-0.5 shadow-2xs">
            {isPaused ? (
              <button type="button" onClick={resumeReading} className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-900 transition-colors" title="Resume">
                <Play className="w-3.5 h-3.5 fill-amber-800 text-amber-800" />
              </button>
            ) : (
              <button type="button" onClick={pauseReading} className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-900 transition-colors" title="Pause">
                <Pause className="w-3.5 h-3.5 fill-amber-800 text-amber-800" />
              </button>
            )}
            <button type="button" onClick={stopReading}
              className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] font-bold transition-colors" title="Stop">
              <VolumeX className="w-3 h-3 text-rose-700" />
              <span>{t('stop_btn', currentLanguage)}</span>
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes lgsw{from{transform:scaleY(.35);opacity:.6}to{transform:scaleY(1);opacity:1}}`}</style>
    </div>
  );
}
