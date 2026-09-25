'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Download, 
  Smartphone, 
  X, 
  Check, 
  ArrowRight, 
  WifiOff, 
  Menu,
  ShieldCheck 
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // If already running in standalone PWA mode, direct launch into active field workspace
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isStandaloneMode =
        (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
        // @ts-expect-error iOS Safari navigator.standalone
        window.navigator?.standalone === true;

      if (isStandaloneMode) {
        router.replace('/app');
      }
    }
  }, [router]);

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

      {/* ── Editorial Top Navigation Bar ── */}
      <header className="sticky top-0 z-40 bg-[#FDFCF7]/90 backdrop-blur-md border-b border-[#E8DFD1]/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo & Tag */}
          <Link 
            href="/"
            className="flex items-center gap-2.5 text-slate-900 hover:opacity-90 transition-opacity"
            aria-label="Alliance India Child Nutrition Platform Home"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              AI
            </div>
            <div>
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 block leading-none">
                Alliance India
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-medium">
                Child Support PWA
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
            <a href="#how-it-works" className="hover:text-emerald-800 transition-colors">
              How It Works
            </a>
            <a href="#snapshot-heading" className="hover:text-emerald-800 transition-colors">
              Whole-Child Scope
            </a>
            <a href="#preview-heading" className="hover:text-emerald-800 transition-colors">
              Form Preview
            </a>
            <a href="#faq-heading" className="hover:text-emerald-800 transition-colors">
              Field FAQ
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-3">
            {canInstall && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700" />
                <span>Install PWA</span>
              </button>
            )}

            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
            >
              <span>Open Field App</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-200" />
            </Link>

            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              aria-label={mobileMenuOpen ? 'Close Menu' : 'Open Menu'}
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-[#E8DFD1] bg-[#F9F6F0] px-4 py-4 space-y-3">
            <nav className="flex flex-col space-y-2 text-sm font-semibold text-slate-700">
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-[#EFEAE0]"
              >
                How It Works
              </a>
              <a
                href="#snapshot-heading"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-[#EFEAE0]"
              >
                Whole-Child Scope
              </a>
              <a
                href="#preview-heading"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-[#EFEAE0]"
              >
                Form Preview
              </a>
              <a
                href="#faq-heading"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-[#EFEAE0]"
              >
                Field FAQ
              </a>
              {canInstall && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleInstallClick();
                  }}
                  className="flex items-center gap-2 p-2 rounded-lg text-emerald-900 font-bold hover:bg-emerald-100/60"
                >
                  <Download className="w-4 h-4 text-emerald-700" />
                  <span>Install PWA to Home Screen</span>
                </button>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* ── Main Editorial Story Flow ── */}
      <main id="main-content">
        {/* Section 1: Hero */}
        <NotebookHero canInstall={canInstall} onInstallClick={handleInstallClick} />

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
        <FinalCta canInstall={canInstall} onInstallClick={handleInstallClick} />
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
