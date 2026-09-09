'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Download,
  WifiOff,
  MapPin,
  HeartPulse,
  Mic,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Smartphone,
  Layers,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  Clock,
  Activity,
  Award,
  Globe,
  X,
  Share2,
  PlusSquare,
  Play,
  RotateCw,
  Eye,
  Check,
} from 'lucide-react';
import { usePwaInstall } from '@/lib/pwa/usePwaInstall';

export default function LandingPage() {
  const router = useRouter();
  const { canInstall, isStandalone, isIos, promptInstall } = usePwaInstall();
  const [showIosModal, setShowIosModal] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // If already running in standalone PWA mode, provide immediate jump to /app
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        // @ts-expect-error iOS Safari navigator.standalone
        window.navigator?.standalone === true;

      if (isStandaloneMode) {
        // Auto-launch directly to the active field workspace
        router.replace('/app');
      }
    }
  }, [router]);

  const handleDownloadClick = async () => {
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

  const steps = [
    {
      id: '01',
      badge: 'Step 1 • Setup',
      title: '1-Tap PWA Installation (Zero Play Store Barrier)',
      summary:
        'No Google Play Store account or Apple ID required. Frontline staff can install the app directly on any budget Android phone, tablet, or iPhone in just 5 seconds.',
      frontlineAction:
        'Tap the "Download App (PWA)" button on this page. When prompted by your phone browser, tap "Install" or "Add to Home Screen".',
      smartBehavior:
        'The Progressive Web App caches the entire core engine and database locally so it runs natively like an installed app.',
      proTip:
        'Once installed, the Alliance India icon appears right on your phone home screen. It will open instantly even in Airplane mode.',
      imageSrc: '/images/guide/dashboard-preview.png',
      imageAlt: 'Alliance India Field Application Home Screen',
    },
    {
      id: '02',
      badge: 'Step 2 • Offline First',
      title: 'Working 100% Offline in Zero-Network Villages',
      summary:
        'Conduct complete multi-child household surveys in deep rural tribal blocks with zero cellular signal or internet connectivity.',
      frontlineAction:
        'Open the app from your home screen. The top wifi indicator turns amber to confirm Offline Mode. Continue filling forms normally.',
      smartBehavior:
        'IndexedDB database automatically saves all answers, anthropometric scores, and audio files encrypted inside your phone storage.',
      proTip:
        'You can turn on Airplane Mode during field visits to save phone battery. You can record 50+ surveys without internet.',
      imageSrc: '/images/guide/dashboard-preview.png',
      imageAlt: 'Offline Resilience and Local Draft Storage',
    },
    {
      id: '03',
      badge: 'Step 3 • Doorstep Location',
      title: 'Automatic Doorstep GPS & Landmark Pinpoint',
      summary:
        'Pinpoints exact beneficiary doorstep within 10 meters, identifying prominent landmarks (e.g. Near Gurudwara, School, Temple, or Main Road) without guessing house numbers.',
      frontlineAction:
        'In Section 2, tap "Fetch Live Address". The button displays "Fetching…" with a spinner, then automatically fills the landmark, colony, district, and state.',
      smartBehavior:
        'Blends live satellite GPS lock with OpenStreetMap and ESRI geocoders to synthesize verified Indian address formats.',
      proTip:
        'If standing under a thick concrete roof, take two steps outside into the open veranda for instant satellite lock.',
      imageSrc: '/images/guide/location-capture.png',
      imageAlt: 'Accurate Live Address and GPS Pinpoint',
    },
    {
      id: '04',
      badge: 'Step 4 • Clinical Nutrition',
      title: 'Clinical WHO Anthropometry & MUAC Scoring',
      summary:
        'Enter child age, height, weight, and Mid-Upper Arm Circumference (MUAC). The system automatically evaluates malnutrition status in real time.',
      frontlineAction:
        'Measure MUAC using standard tri-color tape. Enter measurement in centimeters. The app highlights Green (Normal), Yellow (MAM), or Red (SAM).',
      smartBehavior:
        'Instantaneous calculation of WHO Growth Standard Z-Scores (Weight-for-Age, Height-for-Age, Weight-for-Height) without manual look-up tables.',
      proTip:
        'Ensure the child is standing straight with shoes removed. Re-measure MUAC on the left upper arm at the exact midpoint.',
      imageSrc: '/images/guide/location-capture.png',
      imageAlt: 'Clinical Anthropometry and MUAC scoring',
    },
    {
      id: '05',
      badge: 'Step 5 • Draft Autosave',
      title: 'Pause & Resume Anywhere (Zero Data Loss)',
      summary:
        'Need to pause because a caregiver is busy or infant is sleeping? Every keystroke is saved immediately as an in-progress local draft.',
      frontlineAction:
        'Tap "Save Draft" or simply close the browser. Your draft appears under "My In-Progress Drafts" on the home dashboard.',
      smartBehavior:
        'Atomic local persistence ensures that even unexpected phone shutdowns or battery depletion never lose survey progress.',
      proTip:
        'Tap "Resume" on any draft card anytime to jump right back to your last completed step.',
      imageSrc: '/images/guide/dashboard-preview.png',
      imageAlt: 'My In-Progress Drafts with Safe Resume',
    },
    {
      id: '06',
      badge: 'Step 6 • Auto Cloud Sync',
      title: 'One-Tap Auto Sync & Supervisor Verification',
      summary:
        'Once field staff reach cellular connectivity or Wi-Fi, pending assessments upload automatically to the central institutional repository.',
      frontlineAction:
        'Check the "Waiting to be Sent" counter on your home dashboard. When connected, the app uploads queued records in the background.',
      smartBehavior:
        'Automatic deduplication and collision-safe sync ensure all records are safely transferred with verified cryptographic IDs.',
      proTip:
        'Tap "Submitted Surveys" to review verified timestamps, receipt IDs, and supervisor evaluation status.',
      imageSrc: '/images/guide/audio-consent.png',
      imageAlt: 'Auto Cloud Sync and Audio Consent Verification',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col selection:bg-teal-500 selection:text-white">
      {/* ── Top Floating Header / Brand Bar ── */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/alliance-india-logo.png"
              alt="India HIV/AIDS Alliance"
              width={160}
              height={44}
              className="h-10 w-auto object-contain"
              priority
            />
          </Link>

          {/* Quick Nav Links (Desktop) */}
          <nav className="hidden md:flex items-center space-x-6 text-xs font-semibold text-slate-600">
            <a href="#operational-guide" className="hover:text-teal-700 transition-colors">
              Operational Guide
            </a>
            <a href="#core-capabilities" className="hover:text-teal-700 transition-colors">
              PWA Capabilities
            </a>
            <a href="#field-faq" className="hover:text-teal-700 transition-colors">
              Field FAQ
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleDownloadClick}
              className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-sm hover:shadow-md transition-all transform hover:-translate-y-0.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isStandalone ? 'App Installed' : 'Download App (PWA)'}</span>
            </button>

            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200/90 border border-slate-300 transition-all cursor-pointer"
            >
              <span>Launch App</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Standalone Mode Banner if already opened in installed app ── */}
      {isStandalone && (
        <div className="bg-teal-50 border-b border-teal-200 px-4 py-2 text-center text-xs font-medium text-teal-800 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>You are running the installed Alliance PWA.</span>
          <Link href="/app" className="font-bold underline ml-1 hover:text-teal-950">
            Enter Field Workspace →
          </Link>
        </div>
      )}

      {/* ── Hero Section (Awwwards-Tier Impact & Polish) ── */}
      <section className="relative pt-10 sm:pt-16 pb-16 sm:pb-24 overflow-hidden border-b border-slate-200/70 bg-gradient-to-b from-white via-slate-50 to-slate-100/50">
        {/* Subtle Ambient Radial Glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-teal-100/40 via-emerald-50/20 to-transparent blur-3xl pointer-events-none -z-10" />
        <div className="absolute -top-24 right-10 w-72 h-72 bg-blue-100/30 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          {/* Institutional Status Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-900 text-xs font-semibold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Institutional Field Health Platform • India HIV/AIDS Alliance</span>
          </div>

          {/* Outcome-Led Title */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15] max-w-4xl mx-auto">
            Empowering Frontline Teams to Safeguard Child Nutrition —{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-800">
              Anywhere, 100% Offline.
            </span>
          </h1>

          {/* Jargon-Free Mission Narrative */}
          <p className="text-sm sm:text-base md:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
            A zero-data-loss Progressive Web App built for ASHAs, Anganwadi workers, and field coordinators to assess child health, score anthropometrics, and record verified consent in deep rural villages without internet.
          </p>

          {/* Primary Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={handleDownloadClick}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md hover:shadow-xl transition-all transform hover:-translate-y-0.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download &amp; Install PWA</span>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                Free • 0 MB
              </span>
            </button>

            <Link
              href="/app"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <span>Open Field Workspace</span>
              <ArrowRight className="w-4 h-4 text-slate-600" />
            </Link>
          </div>

          {/* Value Micro-Pills */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200/80 shadow-2xs">
              <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              100% Airplane Mode Ready
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200/80 shadow-2xs">
              <MapPin className="w-3.5 h-3.5 text-teal-600" />
              Sub-10m Landmark Fix
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200/80 shadow-2xs">
              <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
              WHO Growth Standards
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200/80 shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              Encrypted Local Storage
            </span>
          </div>

          {/* ── Realistic Hero Product Preview Frame ── */}
          <div className="pt-8 sm:pt-12 max-w-4xl mx-auto">
            <div className="relative rounded-2xl sm:rounded-3xl p-2 sm:p-3 bg-gradient-to-b from-slate-200/80 to-slate-300/60 border border-slate-300/80 shadow-2xl">
              <div className="bg-white rounded-xl sm:rounded-2xl overflow-hidden border border-slate-200/90 relative">
                {/* Simulated Browser Masthead */}
                <div className="bg-slate-100/90 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <div className="bg-white px-3 py-0.5 rounded-md border border-slate-200 text-[10.5px] font-mono text-slate-500 flex items-center gap-1">
                    <span>🔒</span>
                    <span>app.allianceindia.org</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Live PWA
                  </span>
                </div>

                {/* Dashboard Image */}
                <div className="relative aspect-[16/9] w-full bg-slate-50">
                  <Image
                    src="/images/guide/dashboard-preview.png"
                    alt="Alliance India Child Nutrition Field Dashboard"
                    fill
                    className="object-cover object-top"
                    priority
                  />
                  {/* Floating Action Overlay on Preview */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent flex items-end p-4 sm:p-6">
                    <div className="w-full flex items-center justify-between text-white">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-teal-300">
                          Active Field Workspace
                        </p>
                        <p className="text-sm sm:text-base font-extrabold">
                          Child Nutrition &amp; Education Support Form
                        </p>
                      </div>
                      <Link
                        href="/app"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-900 hover:bg-slate-100 shadow-md transition-all"
                      >
                        <span>Open Live Screen</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Frontline Field Staff Operational Guide (Interactive Roadmap) ── */}
      <section id="operational-guide" className="py-16 sm:py-24 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold uppercase tracking-wider">
              Field Staff Handbook
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Systematic Operational Guide for Field Staff
            </h2>
            <p className="text-sm sm:text-base text-slate-600 font-normal">
              Simple, jargon-free instructions for ASHAs, Anganwadi workers, and NGO field coordinators conducting community nutrition surveys.
            </p>
          </div>

          {/* Interactive Step Selector Pills */}
          <div className="flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {steps.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStep(idx)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeStep === idx
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span className="opacity-80 font-mono text-[10px]">#{s.id}</span>
                <span>{s.badge.split('•')[1]?.trim() || s.badge}</span>
              </button>
            ))}
          </div>

          {/* Active Step Feature Display */}
          {steps[activeStep] && (
            <div className="bg-slate-50 border border-slate-200/90 rounded-3xl p-6 sm:p-8 lg:p-10 shadow-xs grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-300">
              {/* Left Column: Clear Instructions */}
              <div className="lg:col-span-6 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-100/70 text-teal-900 text-xs font-bold font-mono">
                  {steps[activeStep].badge}
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
                  {steps[activeStep].title}
                </h3>

                <p className="text-sm text-slate-600 leading-relaxed font-normal">
                  {steps[activeStep].summary}
                </p>

                {/* Frontline Action Card */}
                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5 shadow-2xs">
                  <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider block">
                    👉 What You Do (Frontline Action):
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {steps[activeStep].frontlineAction}
                  </p>
                </div>

                {/* Smart PWA Behavior Card */}
                <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200/70 space-y-1.5 shadow-2xs">
                  <span className="text-[11px] font-bold text-teal-900 uppercase tracking-wider block">
                    ⚡ What the App Does Automatically:
                  </span>
                  <p className="text-xs text-teal-950 leading-relaxed">
                    {steps[activeStep].smartBehavior}
                  </p>
                </div>

                {/* Golden Field Pro-Tip */}
                <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 space-y-1.5 shadow-2xs">
                  <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                    💡 Field Worker Golden Tip:
                  </span>
                  <p className="text-xs text-amber-950 leading-relaxed">
                    {steps[activeStep].proTip}
                  </p>
                </div>
              </div>

              {/* Right Column: Visual Screenshot & Step Walkthrough */}
              <div className="lg:col-span-6 space-y-4">
                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-slate-300 shadow-md bg-white">
                  <Image
                    src={steps[activeStep].imageSrc}
                    alt={steps[activeStep].imageAlt}
                    fill
                    className="object-contain p-2 bg-slate-100"
                  />
                </div>

                {/* Step Progress Controls */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveStep((prev) => (prev > 0 ? prev - 1 : steps.length - 1))}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
                  >
                    ← Previous Step
                  </button>

                  <span className="text-xs font-mono text-slate-500 font-semibold">
                    Step {activeStep + 1} of {steps.length}
                  </span>

                  <button
                    type="button"
                    onClick={() => setActiveStep((prev) => (prev < steps.length - 1 ? prev + 1 : 0))}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 cursor-pointer"
                  >
                    Next Step →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Core System Capabilities (Bento Grid) ── */}
      <section id="core-capabilities" className="py-16 sm:py-24 bg-slate-50 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Enterprise PWA Architecture &amp; Scale
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 font-normal">
              Built for high reliability, zero data loss, and smooth compliance with national nutrition monitoring frameworks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Card 1: 100% Offline Resilience */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                <WifiOff className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Zero-Loss Offline Engine</h3>
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Uses local IndexedDB storage with multi-version schema migrations. Surveys, drafts, and photos remain accessible offline without internet.
              </p>
            </div>

            {/* Card 2: Sub-10m GPS Pinpoint */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Sub-10m Doorstep &amp; Landmark Fix</h3>
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Blends OpenStreetMap Nominatim, Photon, and ESRI World Geocoding to locate nearby reference points (e.g. &ldquo;Near Chaar Sahibzaade Gurudwara&rdquo;) within 10 meters.
              </p>
            </div>

            {/* Card 3: Clinical WHO Scoring */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                <HeartPulse className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">WHO Clinical Anthropometry</h3>
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Real-time calculation of WHO Z-scores and MUAC color thresholds (Normal, Moderate Acute Malnutrition, Severe Acute Malnutrition) without manual table lookups.
              </p>
            </div>

            {/* Card 4: Audio & Voice Consent */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                <Mic className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Multilingual Voice Consent</h3>
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Pre-recorded voice prompts in Hindi, Marathi, Telugu, Tamil, and English. Record caregiver verbal consent directly into the digital record.
              </p>
            </div>

            {/* Card 5: Privacy & Aadhaar Masking */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Institutional Data Privacy</h3>
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Automatic Aadhaar number masking (only last 4 digits displayed). Complies with Indian personal data protection standards for vulnerable children.
              </p>
            </div>

            {/* Card 6: Supervisor GIS & Line-List */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Supervisor GIS &amp; Analytics</h3>
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Full supervisory portal with MapLibre choropleths, cluster pins, submission verification locks, and automated Google Sheets sync backup.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Field Staff FAQ & Quick Troubleshooting ── */}
      <section id="field-faq" className="py-16 sm:py-24 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Frequently Asked Questions by Field Staff
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 font-normal">
              Quick answers to common questions encountered during rural field visits.
            </p>
          </div>

          <div className="space-y-3">
            <details className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 group cursor-pointer">
              <summary className="font-bold text-slate-900 text-sm list-none flex items-center justify-between">
                <span>Do I need a continuous internet connection during home visits?</span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="pt-2 leading-relaxed text-slate-600 font-normal">
                No. You only need internet for a few seconds once to download the app. After that, you can conduct all surveys in 100% offline mode or Airplane mode. Your data is stored safely in your phone and syncs automatically when you return to coverage.
              </p>
            </details>

            <details className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 group cursor-pointer">
              <summary className="font-bold text-slate-900 text-sm list-none flex items-center justify-between">
                <span>What should I do if the GPS button shows &ldquo;GPS position unavailable&rdquo;?</span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="pt-2 leading-relaxed text-slate-600 font-normal">
                1. Make sure your phone&apos;s &ldquo;Location / GPS&rdquo; toggle is turned ON in settings.<br />
                2. If you are inside a concrete or tin-roofed house, take two steps outside to allow satellites to connect directly.<br />
                3. You can also manually type or edit the colony and landmark names in the address box.
              </p>
            </details>

            <details className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 group cursor-pointer">
              <summary className="font-bold text-slate-900 text-sm list-none flex items-center justify-between">
                <span>What happens if my phone battery dies in the middle of a survey?</span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="pt-2 leading-relaxed text-slate-600 font-normal">
                Nothing is lost. The PWA automatically saves each field the moment you enter it. When you recharge your phone and open the app, your survey will be waiting under &ldquo;My In-Progress Drafts&rdquo; with the exact step where you left off.
              </p>
            </details>

            <details className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 group cursor-pointer">
              <summary className="font-bold text-slate-900 text-sm list-none flex items-center justify-between">
                <span>Can multiple field workers share the same smartphone?</span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="pt-2 leading-relaxed text-slate-600 font-normal">
                Yes. Each draft is tagged with a unique intake code (e.g. DL-SOU-091639-01). Different surveyors can complete different drafts on the same device without overlapping.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* ── Bottom Call to Action Hero Card ── */}
      <section className="py-16 bg-slate-900 text-white relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-900/60 border border-teal-700 text-teal-300 text-xs font-semibold">
            Ready to deploy in your district
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Start Field Nutrition Assessments Today
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed font-normal">
            Equip your frontline survey teams with the verified, zero-data-loss digital standard for child nutrition and education support.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleDownloadClick}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-bold text-slate-900 bg-teal-400 hover:bg-teal-300 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download PWA to Device</span>
            </button>
            <Link
              href="/app"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer"
            >
              <span>Open Field Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Minimal Institutional Footer ── */}
      <footer className="py-8 bg-slate-950 text-slate-400 text-xs border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <span className="font-semibold text-slate-300">India HIV/AIDS Alliance</span>
            <span>•</span>
            <span>Child Nutrition &amp; Support Platform</span>
          </div>
          <div className="flex items-center space-x-4 text-[11px]">
            <span>Version 3.0.0 (Phase 3 Production)</span>
            <span>•</span>
            <span>100% Offline PWA</span>
          </div>
        </div>
      </footer>

      {/* ── iOS Add to Home Screen Instructions Modal ── */}
      {showIosModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-sm text-slate-900">Install on iPhone / iPad</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIosModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-normal">
              Apple iOS requires adding PWAs to your Home Screen from the Safari browser:
            </p>

            <ol className="space-y-3 text-xs text-slate-700">
              <li className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold font-mono text-teal-700">1.</span>
                <span>
                  Tap the <strong className="text-slate-900">Share button</strong> (square icon with arrow pointing up) at the bottom of Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold font-mono text-teal-700">2.</span>
                <span>
                  Scroll down and tap <strong className="text-slate-900">&ldquo;Add to Home Screen&rdquo;</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold font-mono text-teal-700">3.</span>
                <span>
                  Tap <strong className="text-slate-900">Add</strong> in the top right. The app will appear on your home screen!
                </span>
              </li>
            </ol>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowIosModal(false);
                  router.push('/app');
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 transition-colors cursor-pointer"
              >
                Continue to Web App
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Toast when PWA installed ── */}
      {installSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-700 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom duration-300">
          <Check className="w-5 h-5" />
          <div>
            <p className="text-xs font-bold">App Installed Successfully!</p>
            <p className="text-[11px] text-emerald-100">Launching field workspace…</p>
          </div>
        </div>
      )}
    </div>
  );
}
