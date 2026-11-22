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
  aliases?: string[];
  textKey: string;
  isFilled?: (fd: Record<string, unknown>, sig: boolean) => boolean;
}

const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const num = (v: unknown) => typeof v === 'number' && !isNaN(v) && v > 0;
const bool = (v: unknown) => v === true || v === false;

export const FORM_READING_SEQUENCE: ReadingItem[] = [
  // SECTION 1: Consent
  { id: 'sec-consent',          textKey: 'sec_consent_full' },
  { id: 'q-consent-decision',   aliases: ['caregiver-consent'],   textKey: 'consent_q',
    isFilled: (fd) => bool(fd.agreeToParticipate) },
  { id: 'q-caregiver-name',     aliases: ['caregiver-name'],     textKey: 'caregiver_name',
    isFilled: (fd) => str(fd.caregiverName) },
  { id: 'q-caregiver-rel',      aliases: ['caregiver-relationship'],      textKey: 'caregiver_relationship',
    isFilled: (fd) => str(fd.caregiverRelationship) },
  { id: 'q-caregiver-sig',      aliases: ['caregiver-signature'],      textKey: 'caregiver_signature_sub',
    isFilled: (_fd, sig) => sig },

  // SECTION 2: Demographics & Child Profile
  { id: 'sec-child',            textKey: 'sec_demographics_full' },
  { id: 'q-child-date',         textKey: 'child_date_of_intake',
    isFilled: (fd) => str(fd.dateOfFilling) },
  { id: 'q-child-name',         aliases: ['demographics-childName'],         textKey: 'child_name',
    isFilled: (fd) => str(fd.childName) },
  { id: 'q-child-dob',          aliases: ['demographics-dob', 'q-child-age'],          textKey: 'dob',
    isFilled: (fd) => str(fd.dob) || num(Number(fd.ageYears)) },
  { id: 'q-child-gender',       aliases: ['demographics-gender'],       textKey: 'gender',
    isFilled: (fd) => str(fd.gender) },
  { id: 'q-child-orphan',       aliases: ['demographics-orphanStatus'],       textKey: 'orphan_status',
    isFilled: (fd) => str(fd.orphanStatus) },
  { id: 'q-child-address',      aliases: ['demographics-fullAddress'],      textKey: 'address',
    isFilled: (fd) => str(fd.fullAddress) || str(fd.villageCity) || str(fd.district) },
  { id: 'q-child-aadhaar',      aliases: ['sec-child-aadhaar'],      textKey: 'child_aadhaar_number',
    isFilled: (fd) => typeof fd.childAadhaarNumber === 'string' && fd.childAadhaarNumber.length >= 12 },

  // SECTION 3: Banking
  { id: 'sec-banking',          textKey: 'sec_banking_full' },
  { id: 'q-bank-holder',        textKey: 'bank_acc_holder',
    isFilled: (fd) => str(fd.bankAccountHolderName) },
  { id: 'q-bank-num',           textKey: 'bank_acc_num',
    isFilled: (fd) => str(fd.bankAccountNumber) },
  { id: 'q-bank-ifsc',          textKey: 'bank_ifsc',
    isFilled: (fd) => str(fd.bankIfscCode) },
  { id: 'q-bank-phone',         aliases: ['bankLinkedMobileNumber'],         textKey: 'bank_linked_phone',
    isFilled: (fd) => typeof fd.bankLinkedMobileNumber === 'string' && fd.bankLinkedMobileNumber.length >= 10 },

  // SECTION 4: Household Economics
  { id: 'sec-household',        textKey: 'sec_household_full' },
  { id: 'q-hh-members',         aliases: ['household-totalFamilyMembers'],         textKey: 'hh_members',
    isFilled: (fd) => num(fd.totalFamilyMembers as number) },
  { id: 'q-hh-children',        aliases: ['household-numberOfChildrenUnder18'],        textKey: 'hh_children',
    isFilled: (fd) => typeof fd.numberOfChildrenUnder18 === 'number' && !isNaN(fd.numberOfChildrenUnder18 as number) },
  { id: 'q-hh-income',          aliases: ['household-monthlyIncomeRs'],          textKey: 'hh_income',
    isFilled: (fd) => typeof fd.monthlyIncomeRs === 'number' && (fd.monthlyIncomeRs as number) >= 0 },
  { id: 'q-hh-source',          aliases: ['household-mainSourceOfIncome'],          textKey: 'hh_income_source',
    isFilled: (fd) => str(fd.mainSourceOfIncome) },

  // SECTION 5: Clinical / Health Measurements
  { id: 'sec-health',           textKey: 'sec_clinical_full' },
  { id: 'q-cli-weight',         aliases: ['health-weightKg'],         textKey: 'weight',
    isFilled: (fd) => num(fd.weightKg as number) },
  { id: 'q-cli-height',         aliases: ['health-heightCm'],         textKey: 'height',
    isFilled: (fd) => num(fd.heightCm as number) },
  { id: 'q-cli-bmi',            textKey: 'bmi',
    isFilled: (fd) => num(fd.weightKg as number) && num(fd.heightCm as number) },
  { id: 'q-cli-art-status',     aliases: ['health-artStatus'],     textKey: 'art_status_q',
    isFilled: (fd) => str(fd.artStatus) },
  { id: 'q-cli-currently-on-art', aliases: ['health-currentlyOnArt'], textKey: 'currently_on_art_q',
    isFilled: (fd) => fd.artStatus !== 'Transferred In' || str(fd.currentlyOnArt) },
  { id: 'q-cli-art-num',        aliases: ['health-artIdNumber'],        textKey: 'art_num',
    isFilled: (fd) => fd.artStatus !== 'On ART' || str(fd.artIdNumber) },
  { id: 'q-cli-art-init-date',  aliases: ['health-artInitiationDate'],  textKey: 'art_init_date_q',
    isFilled: (fd) => !fd.artStatus || fd.artStatus !== 'On ART' || str(fd.artInitiationDate) },
  { id: 'q-cli-art-med-type',   aliases: ['health-artMedicineType'],   textKey: 'art_regimen',
    isFilled: (fd) => fd.artStatus !== 'On ART' || str(fd.artMedicineType) },
  { id: 'q-cli-cd4',            aliases: ['health-cd4Count'],            textKey: 'cd4_count_q',
    isFilled: (fd) => str(fd.cd4Count) },
  { id: 'q-cli-hb',             aliases: ['health-haemoglobinGdl'],             textKey: 'hemoglobin',
    isFilled: (fd) => num(Number(fd.haemoglobinGdl)) },
  { id: 'q-cli-vl-status',      aliases: ['health-vlStatus'],      textKey: 'vl_status_q',
    isFilled: (fd) => str(fd.vlStatus) },
  { id: 'q-cli-vl-date',        textKey: 'vl_date_q',
    isFilled: (fd) => !fd.vlStatus || fd.vlStatus === 'Not tested' || str(fd.vlDate) },
  { id: 'q-cli-vl',             aliases: ['health-viralLoad'],             textKey: 'viral_load',
    isFilled: (fd) => !fd.vlStatus || fd.vlStatus === 'Not tested' || fd.vlStatus === 'Awaiting results' || str(fd.viralLoad) },
  { id: 'q-cli-other-conditions', textKey: 'co_morbidities_q',
    isFilled: (fd) => Array.isArray(fd.otherHealthConditions) && fd.otherHealthConditions.length > 0 },
  { id: 'q-cli-disability',     aliases: ['health-hasDisability'],     textKey: 'disability_q',
    isFilled: (fd) => str(fd.hasDisability) },
  { id: 'q-cli-disability-type', aliases: ['health-disabilityType'], textKey: 'disability_type_q',
    isFilled: (fd) => fd.hasDisability !== 'Yes' || str(fd.disabilityType) },
  { id: 'q-cli-disability-cert', aliases: ['health-disabilityCertificateStatus'], textKey: 'disability_cert_q',
    isFilled: (fd) => fd.hasDisability !== 'Yes' || str(fd.disabilityCertificateStatus) },

  // SECTION 6: Nutrition Habits
  { id: 'sec-nutrition',        textKey: 'sec_nutrition_full' },
  { id: 'q-nut-meals',          aliases: ['nutrition-mealsPerDay', 'input-nutrition-meals'],          textKey: 'meals_per_day',
    isFilled: (fd) => num(fd.mealsPerDay as number) },
  { id: 'q-nut-appetite',       aliases: ['nutrition-appetite'],       textKey: 'appetite',
    isFilled: (fd) => str(fd.appetite) },
  { id: 'q-nut-symptoms',       aliases: ['nutrition-malnutritionSymptoms'],       textKey: 'nut_symptoms_q',
    isFilled: (fd) => str(fd.malnutritionSymptoms) },

  // SECTION 7: Education Status
  { id: 'sec-education',        textKey: 'sec_education_full' },
  { id: 'q-edu-status',         aliases: ['education-educationStatus'],         textKey: 'edu_status',
    isFilled: (fd) => str(fd.educationStatus) },
  { id: 'q-edu-status-specify', aliases: ['education-educationStatusSpecify'], textKey: 'edu_status_specify_q',
    isFilled: (fd) => fd.educationStatus !== 'Other' || str(fd.educationStatusSpecify) },
  { id: 'q-edu-school',         aliases: ['education-schoolName'],         textKey: 'school_name',
    isFilled: (fd) => fd.educationStatus !== 'Currently going to school' || str(fd.schoolName) },
  { id: 'q-edu-start-date',     aliases: ['education-schoolSessionStartDate'],     textKey: 'school_start_date_q',
    isFilled: (fd) => fd.educationStatus !== 'Currently going to school' || str(fd.schoolSessionStartDate) },
  { id: 'q-edu-type',           aliases: ['education-schoolType'],           textKey: 'school_type',
    isFilled: (fd) => fd.educationStatus !== 'Currently going to school' || str(fd.schoolType) },
  { id: 'q-edu-class',          aliases: ['education-currentClass'],          textKey: 'current_class',
    isFilled: (fd) => fd.educationStatus !== 'Currently going to school' || str(fd.currentClass) },
  { id: 'q-edu-class-specify',  aliases: ['education-currentClassSpecify'],  textKey: 'current_class_specify_q',
    isFilled: (fd) => fd.educationStatus !== 'Currently going to school' || fd.currentClass !== 'Other' || str(fd.currentClassSpecify) },
  { id: 'q-edu-attendance',     aliases: ['education-attendance'],     textKey: 'attendance',
    isFilled: (fd) => fd.educationStatus !== 'Currently going to school' || str(fd.attendance) },
  { id: 'q-edu-scheme',         aliases: ['education-receivingEducationSchemeBenefit', 'education-scheme-benefit'],         textKey: 'edu_scheme_benefit_q',
    isFilled: (fd) => str(fd.receivingEducationSchemeBenefit) },
  { id: 'q-edu-scheme-name',    aliases: ['education-scheme-name-container', 'education-scheme-name'],    textKey: 'edu_scheme_name_q',
    isFilled: (fd) => (fd.receivingEducationSchemeBenefit !== 'Yes' && fd.receivingEducationSchemeBenefit !== 'Applied / Under Review') || str(fd.educationSchemeName) },
  { id: 'q-edu-scheme-specify', aliases: ['education-scheme-specify-container', 'education-scheme-name-specify'], textKey: 'edu_scheme_specify_q',
    isFilled: (fd) => !str(fd.educationSchemeNameSpecify) || str(fd.educationSchemeNameSpecify) },

  // SECTION 8: Expenses & Programme Support
  { id: 'sec-expenses',         textKey: 'sec_expenses_full' },
  { id: 'q-exp-grid',           textKey: 'edu_expenses_q',
    isFilled: (fd) => typeof fd.schoolFees === 'number' || typeof fd.books === 'number' || typeof fd.uniform === 'number' || typeof fd.requiredSchoolFees === 'number' || typeof fd.requiredBooks === 'number' },

  // SECTION 9: Programme Approval & Final Review
  { id: 'sec-review',           textKey: 'sec_review_full' },
  { id: 'q-rev-confirm',        aliases: ['review-allInfoCorrect'],        textKey: 'review_confirmed',
    isFilled: (fd) => fd.allInfoCorrect === true },
  { id: 'q-rev-interviewer',    aliases: ['review-formSubmittedBy'],    textKey: 'interviewer_name',
    isFilled: (fd) => str(fd.formSubmittedBy) },
  { id: 'q-rev-sr',             aliases: ['review-srName'],             textKey: 'sr_name_q',
    isFilled: (fd) => str(fd.srName) },
  { id: 'q-rev-ssr',            aliases: ['review-ssrName'],            textKey: 'ssr_name_q',
    isFilled: (fd) => str(fd.ssrName) },
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
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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
    c = c.replace(/\s*[��]\s*/g, ', ').replace(/\s*\/\s*/g, ' or ');
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
    if (matching.length > 0) {
      return (
        matching.find(v => /natural|neural|online|enhanced|premium/i.test(v.name)) ||
        matching.find(v => /google|microsoft/i.test(v.name)) ||
        matching[0]
      );
    }
    // Fallback: any Indian accent voice, or first available voice
    const inVoice = voices.find(v => v.lang.includes('IN') || v.lang.includes('hi') || v.lang.includes('en'));
    return inVoice || voices[0] || null;
  }, []);

  const speak = useCallback((text: string, lang: string, onEnd?: () => void) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === lang);
    const speechLang = langConfig?.speechLang || 'en-IN';
    const clean = sanitizeSpeechText(text, lang);
    if (!clean) {
      onEnd?.();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(clean);
    activeUtteranceRef.current = utterance;
    utterance.lang = speechLang;
    utterance.rate = 0.9;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;
    const voice = getSpeechVoice(speechLang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    let finished = false;
    let safetyTimer: NodeJS.Timeout | null = null;
    const handleDone = () => {
      if (finished) return;
      finished = true;
      if (safetyTimer) clearTimeout(safetyTimer);
      activeUtteranceRef.current = null;
      onEnd?.();
    };

    utterance.onend = handleDone;
    utterance.onerror = handleDone;

    // Safety timeout: calculated based on text length + 3.5s buffer
    const maxDurationMs = Math.max(3000, (clean.length / 8) * 1000 + 3500);
    safetyTimer = setTimeout(handleDone, maxDurationMs);

    window.speechSynthesis.speak(utterance);
  }, [sanitizeSpeechText, getSpeechVoice]);

  // Returns the section header id that precedes a given field id (for section-crossing announcements)
  const getSectionHeader = useCallback((fieldId: string): string | null => {
    const idx = FORM_READING_SEQUENCE.findIndex(i => i.id === fieldId);
    if (idx <= 0) return null;
    for (let i = idx - 1; i >= 0; i--) {
      if (!FORM_READING_SEQUENCE[i].isFilled) return FORM_READING_SEQUENCE[i].id;
    }
    return null;
  }, []);

  const guideToQuestion = useCallback((id: string) => {
    const item = FORM_READING_SEQUENCE.find(i => i.id === id || i.aliases?.includes(id));
    if (!item) return;

    // Detect section crossing: if new field is in a different section than current, announce section header first
    const prevSection = getSectionHeader(liveActiveIdRef.current || '');
    const nextSection = getSectionHeader(id);
    const crossingSection = nextSection && nextSection !== prevSection && nextSection !== 'sec-consent';

    setLiveActiveId(id);
    onReadingChange(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (crossingSection) {
      const secItem = FORM_READING_SEQUENCE.find(i => i.id === nextSection);
      const secText = secItem ? t(secItem.textKey, currentLanguage) : '';
      speak(secText, currentLanguage, () => {
        speak(t(item.textKey, currentLanguage), currentLanguage);
      });
    } else {
      speak(t(item.textKey, currentLanguage), currentLanguage);
    }
  }, [currentLanguage, onReadingChange, speak, getSectionHeader]);

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
      // Skip section headers (no isFilled predicate) — they are announced on section transition
      if (!item.isFilled) continue;
      // Skip fields that are not present in the DOM (e.g. non-applicable category or conditional field)
      if (typeof document !== 'undefined' && !document.getElementById(item.id)) continue;
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
    const textInputs = [
      'caregiverName', 'childName', 'contactNumber', 'fullAddress',
      'bankAccountHolderName', 'bankAccountNumber', 'bankIfscCode', 'bankLinkedMobileNumber',
      'artIdNumber', 'cd4Count', 'haemoglobinGdl', 'viralLoad', 'otherHealthConditionSpecify',
      'disabilityType', 'malnutritionSymptoms', 'educationStatusSpecify', 'schoolName',
      'currentClassSpecify', 'educationSchemeNameSpecify', 'formSubmittedBy', 'srName', 'ssrName'
    ];
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

    // Always start by announcing Section 1 intro, then immediately guide to first unfilled field
    const consentItem = FORM_READING_SEQUENCE.find(i => i.id === 'sec-consent');
    if (consentItem) {
      setLiveActiveId('sec-consent');
      onReadingChange('sec-consent');
      const el = document.getElementById('sec-consent');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const introText = t(consentItem.textKey, currentLanguage);
      speak(introText, currentLanguage, () => {
        // After section intro, find and navigate to the first unfilled field
        const fd = formData || {};
        const first = findNextUnfilled(null, fd, hasSavedSignature);
        if (first) {
          if (isLiveGuideRef.current) guideToQuestion(first);
        } else {
          setAllDone(true);
          speak(
            currentLanguage === 'en'
              ? 'All fields are complete. Please tap Submit Survey to finish.'
              : 'All fields complete. Please submit.',
            currentLanguage
          );
        }
      });
    } else {
      const fd = formData || {};
      const first = findNextUnfilled(null, fd, hasSavedSignature);
      if (first) {
        guideToQuestion(first);
      } else {
        setAllDone(true);
        speak('All fields are already complete. You can submit now!', currentLanguage);
      }
    }
  }, [formData, hasSavedSignature, findNextUnfilled, guideToQuestion, speak, currentLanguage, onReadingChange]);

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

      {/* Listen button removed per mobile-first user requirement */}
      <style>{`@keyframes lgsw{from{transform:scaleY(.35);opacity:.6}to{transform:scaleY(1);opacity:1}}`}</style>
    </div>
  );
}
