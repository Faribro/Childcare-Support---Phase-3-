'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Smartphone, 
  X, 
  Check 
} from 'lucide-react';
import { usePwaInstall } from '@/lib/pwa/usePwaInstall';
import { NotebookHero } from '@/components/landing/NotebookHero';
import { WholeChildSnapshot } from '@/components/landing/WholeChildSnapshot';
import { FieldRhythm } from '@/components/landing/FieldRhythm';
import { FieldReadiness } from '@/components/landing/FieldReadiness';
import { DesignPrinciples } from '@/components/landing/DesignPrinciples';
import { ExperiencePreview } from '@/components/landing/ExperiencePreview';
import { FieldFaq } from '@/components/landing/FieldFaq';
import { FinalCta } from '@/components/landing/FinalCta';
import { NotebookFooter } from '@/components/landing/NotebookFooter';

export default function LandingPage() {
  const router = useRouter();
  const { canInstall, isStandalone, isIos, promptInstall } = usePwaInstall();
  const [showIosModal, setShowIosModal] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  const handleInstallClick = async () => {
    if (isIos && !isStandalone) {
      setShowIosModal(true);
      return;
    }

    const result = await promptInstall();
    if (result === 'accepted') {
      setInstallSuccess(true);
      setTimeout(() => {
        router.push('/app');
      }, 1500);
    } else if (result === 'manual-ios') {
      setShowIosModal(true);
    } else if (result === 'unsupported') {
      // Direct navigation if browser already installed or unsupported
      router.push('/app');
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCF7] text-slate-800 antialiased selection:bg-emerald-100 selection:text-emerald-900 font-sans">
      {/* Accessible skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-800 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* ── Main Editorial Story Flow (Binder Spread Dominates First Viewport) ── */}
      <main id="main-content">
        {/* Section 1: Hero */}
        <div id="opening-note">
          <NotebookHero 
            canInstall={canInstall} 
            onInstallClick={handleInstallClick} 
            isStandalone={isStandalone} 
          />
        </div>

        {/* Section 2: Why it matters - Whole-child snapshot */}
        <WholeChildSnapshot />

        {/* Section 3: How it works - 3-step field rhythm */}
        <FieldRhythm />

        {/* Section 4: Built for real field conditions */}
        <FieldReadiness />

        {/* Section 5: Designed with care - Guiding principles */}
        <DesignPrinciples />

        {/* Section 6: Experience Preview - Sanitized field UI */}
        <ExperiencePreview />

        {/* Section 7: Frontline FAQ Accordion */}
        <FieldFaq />

        {/* Section 8: Final Call to Action */}
        <FinalCta 
          canInstall={canInstall} 
          onInstallClick={handleInstallClick} 
          isStandalone={isStandalone} 
        />
      </main>

      {/* Section 9: Institutional Footer */}
      <NotebookFooter />

      {/* ── iOS Add to Home Screen Instructions Modal ── */}
      {showIosModal && (
        <div 
          role="dialog"
          aria-labelledby="ios-modal-title"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-700" />
                <h3 id="ios-modal-title" className="font-bold text-sm text-slate-900">
                  Install on iPhone / iPad
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIosModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                aria-label="Close guide"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-normal">
              Apple iOS requires adding PWAs to your Home Screen from the Safari browser:
            </p>

            <ol className="space-y-3 text-xs text-slate-700">
              <li className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold font-mono text-emerald-700">1.</span>
                <span>
                  Tap the <strong className="text-slate-900">Share button</strong> (square icon with upward arrow) at the bottom of Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold font-mono text-emerald-700">2.</span>
                <span>
                  Scroll down and tap <strong className="text-slate-900">&ldquo;Add to Home Screen&rdquo;</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold font-mono text-emerald-700">3.</span>
                <span>
                  Tap <strong className="text-slate-900">Add</strong> in the top right. The app icon will appear on your home screen!
                </span>
              </li>
            </ol>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowIosModal(false)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 transition-colors cursor-pointer"
              >
                Got It, Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Toast when PWA installed ── */}
      {installSuccess && (
        <div 
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 bg-emerald-800 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom duration-300"
        >
          <Check className="w-5 h-5 text-emerald-300" />
          <div>
            <p className="text-xs font-bold">App Installed Successfully!</p>
            <p className="text-[11px] text-emerald-100">Launching field workspace&hellip;</p>
          </div>
        </div>
      )}
    </div>
  );
}
