'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Volume2, Pause, ShieldCheck, Mic } from 'lucide-react';
import { t } from '@/lib/i18n/translations';

interface ConsentAudioNoticeProps {
  currentLanguage: string;
  agreeToParticipate?: boolean | null;
  onConsentDecision?: (agreed: boolean) => void;
}

export function ConsentAudioNotice({
  currentLanguage,
  agreeToParticipate,
  onConsentDecision,
}: ConsentAudioNoticeProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Audio source based on selected language (English or Hindi uploaded recordings)
  const audioSrc = currentLanguage === 'hi' ? '/audio/consent_hi.wav' : '/audio/consent_en.wav';

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [currentLanguage]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const toggleAudio = () => {
    if (!audioRef.current) {
      const audio = new Audio(audioSrc);
      audioRef.current = audio;

      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
      });
      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
      });
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });
      audio.addEventListener('error', () => {
        setIsPlaying(false);
      });
    } else {
      const targetSrc = window.location.origin + audioSrc;
      if (audioRef.current.src !== targetSrc && !audioRef.current.src.endsWith(audioSrc)) {
        audioRef.current.src = audioSrc;
      }
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('Audio playback fallback to TTS:', err);
          setIsPlaying(false);
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(t('consent_audio_statement', currentLanguage));
            utterance.lang = currentLanguage === 'hi' ? 'hi-IN' : 'en-IN';
            window.speechSynthesis.speak(utterance);
          }
        });
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  return (
    <div id="consent-audio-notice" className="relative rounded-2xl bg-gradient-to-br from-purple-50/90 via-white to-rose-50/50 border border-purple-200/90 p-3.5 sm:p-5 shadow-xs space-y-3 overflow-hidden transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-purple-100">
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-purple-600 text-white shadow-xs shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight">
              {t('consent_notice_title', currentLanguage)}
            </h4>
            <p className="text-[10px] sm:text-[11px] text-purple-700 font-medium">
              {currentLanguage === 'hi'
                ? 'आधिकारिक रिकॉर्ड किया गया सहमति विवरण (ऑडियो उपलब्ध)'
                : 'Official recorded consent statement (Audio Available)'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleAudio}
          className={`inline-flex items-center justify-center space-x-2 px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer ${
            isPlaying
              ? 'bg-rose-600 text-white hover:bg-rose-700 ring-2 ring-rose-400/40'
              : 'bg-purple-600 text-white hover:bg-purple-700 active:scale-95'
          }`}
          aria-label={isPlaying ? t('consent_pause_audio', currentLanguage) : t('consent_listen_audio', currentLanguage)}
        >
          {isPlaying ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              <span>{t('consent_pause_audio', currentLanguage)}</span>
              <div className="flex items-end space-x-0.5 h-3 ml-1">
                <span className="w-0.5 bg-white rounded-full animate-bounce [animation-delay:0ms] h-2.5" />
                <span className="w-0.5 bg-white rounded-full animate-bounce [animation-delay:150ms] h-3.5" />
                <span className="w-0.5 bg-white rounded-full animate-bounce [animation-delay:300ms] h-2" />
              </div>
            </>
          ) : (
            <>
              <Volume2 className="w-3.5 h-3.5 animate-pulse" />
              <span>{t('consent_listen_audio', currentLanguage)}</span>
            </>
          )}
        </button>
      </div>

      {isPlaying && (
        <div className="flex items-center space-x-2 text-[11px] text-purple-800 font-mono bg-purple-100/70 px-3 py-1 rounded-lg">
          <span>{formatTime(currentTime)}</span>
          <div className="flex-1 bg-purple-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-purple-600 h-full transition-all duration-200"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          <span>{formatTime(duration)}</span>
        </div>
      )}

      <blockquote className="relative p-3 sm:p-3.5 rounded-xl bg-white/95 border border-purple-100/90 text-slate-800 text-[12px] sm:text-[12.5px] leading-relaxed font-sans shadow-2xs">
        <p className="font-medium text-slate-800 italic select-text">
          &ldquo;{t('consent_audio_statement', currentLanguage)}&rdquo;
        </p>
      </blockquote>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5 text-[11px] sm:text-[11.5px] text-slate-600">
        <span className="inline-flex items-center space-x-1.5 text-purple-900 font-semibold">
          <Mic className="w-3.5 h-3.5 text-purple-600 shrink-0" />
          <span>{t('consent_voice_hint', currentLanguage)}</span>
        </span>

        {onConsentDecision && (
          <div className="flex items-center space-x-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => onConsentDecision(true)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                agreeToParticipate === true
                  ? 'bg-purple-700 text-white shadow-xs ring-1 ring-purple-400'
                  : 'bg-purple-100 text-purple-900 hover:bg-purple-200'
              }`}
            >
              {currentLanguage === 'hi' ? 'हाँ (सहमत)' : 'Say Yes (Agree)'}
            </button>
            <button
              type="button"
              onClick={() => onConsentDecision(false)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                agreeToParticipate === false
                  ? 'bg-rose-700 text-white shadow-xs ring-1 ring-rose-400'
                  : 'bg-rose-100 text-rose-900 hover:bg-rose-200'
              }`}
            >
              {currentLanguage === 'hi' ? 'ना (अस्वीकार)' : 'Say No (Refuse)'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
