'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';
import {
  Check
} from 'lucide-react';
import { usePwaInstall } from '@/lib/pwa/usePwaInstall';
import { NotebookHero } from '@/components/landing/NotebookHero';
import { WholeChildSnapshot } from '@/components/landing/WholeChildSnapshot';
import { ConnectedCareStory } from '@/components/landing/ConnectedCareStory';
import { ExperiencePreview } from '@/components/landing/ExperiencePreview';
import { FieldFaq } from '@/components/landing/FieldFaq';
import { FinalCta } from '@/components/landing/FinalCta';
import { NotebookFooter } from '@/components/landing/NotebookFooter';
import { Reveal } from '@/components/landing/Reveal';
import { InstallDownloadModal } from '@/components/landing/InstallDownloadModal';
import motionStyles from '@/components/landing/landing-motion.module.css';

export default function LandingPage() {
  const router = useRouter();
  const { user, isLoaded, isUnlocked } = useEvaluationAccess();
  const { canInstall, hasPrompt, isStandalone, promptInstall } = usePwaInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // Evaluation users (Leadership / State Reviewer) land directly in their workspace
  useEffect(() => {
    if (isLoaded && isUnlocked && user && user.isVerified) {
      const isEval = user.role === 'LEADERSHIP' || user.role === 'STATE_REVIEWER' || user.role === 'ADMIN';
      if (isEval) {
        router.replace('/supervisor');
      }
    }
  }, [isLoaded, isUnlocked, user, router]);

  const handleInstallClick = () => {
    setShowInstallModal(true);
  };

  const handlePromptInstall = async () => {
    const result = await promptInstall();
    if (result === 'accepted') {
      setInstallSuccess(true);
      setShowInstallModal(false);
      setTimeout(() => {
        router.push('/app');
      }, 1500);
    }
    return result;
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
        {/* Section 1: Hero — composed multi-part entrance (folder + headline + device) */}
        <div id="opening-note" className={motionStyles.heroRise}>
          <NotebookHero
            canInstall={canInstall}
            onInstallClick={handleInstallClick}
            isStandalone={isStandalone}
          />
        </div>

        {/* Section 2: Why it matters — slides from left (terrain context) */}
        <Reveal className={motionStyles.revealFromLeft}>
          <WholeChildSnapshot />
        </Reveal>

        {/* Section 3: MOMENT C — The Connection Returns (illustrative 7-step offline sync story) */}
        <ConnectedCareStory />

        {/* Section 4: Experience preview — rise with tilt (UI showcase) */}
        <Reveal className={motionStyles.revealTilt}>
          <ExperiencePreview />
        </Reveal>

        {/* Section 5: FAQ — simple default gentle rise */}
        <Reveal>
          <FieldFaq />
        </Reveal>

        {/* Section 6: Final CTA — spread rise (invitation / close of narrative) */}
        <Reveal className={motionStyles.revealSpread}>
          <FinalCta
            canInstall={canInstall}
            onInstallClick={handleInstallClick}
            isStandalone={isStandalone}
          />
        </Reveal>
      </main>

      {/* Section 7: Institutional Footer */}
      <NotebookFooter />

      {/* ── Accessible Install / Download Modal ── */}
      <InstallDownloadModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        canInstallPwa={canInstall}
        hasPrompt={hasPrompt}
        isStandalone={isStandalone}
        onPromptInstall={handlePromptInstall}
      />

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
