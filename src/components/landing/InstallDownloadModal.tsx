'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Smartphone,
  Apple,
  Monitor,
  Download,
  Check,
  X,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  ReleaseManifest,
  PlatformType,
  formatFileSizeBytes,
  validateReleaseManifest,
} from '@/lib/release/releaseManifestContract';
import { DEFAULT_RELEASE_MANIFEST } from '@/lib/release/defaultReleaseManifest';

export type ModalPlatformTab = 'android' | 'ios' | 'desktop';

export interface InstallDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  canInstallPwa?: boolean;
  hasPrompt?: boolean;
  isStandalone?: boolean;
  onPromptInstall?: () => Promise<'accepted' | 'dismissed' | 'manual-ios' | 'unsupported'>;
  manifest?: ReleaseManifest;
}

export function InstallDownloadModal({
  isOpen,
  onClose,
  canInstallPwa = false,
  hasPrompt = false,
  isStandalone = false,
  onPromptInstall,
  manifest = DEFAULT_RELEASE_MANIFEST,
}: InstallDownloadModalProps) {
  // Validate manifest safety on mount/prop change
  const validationResult = validateReleaseManifest(manifest);
  const safeManifest = validationResult.valid && validationResult.manifest ? validationResult.manifest : DEFAULT_RELEASE_MANIFEST;

  // Platform detection convenience (defaults to desktop if undetermined)
  const [detectedPlatform, setDetectedPlatform] = useState<PlatformType | 'desktop'>('desktop');
  const [activeTab, setActiveTab] = useState<ModalPlatformTab>('android');
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);
  const [pwaInstallStatus, setPwaInstallStatus] = useState<'idle' | 'installing' | 'accepted' | 'dismissed'>('idle');

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // Focus restoration & body scroll lock lifecycle
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = (document.activeElement as HTMLElement) || null;
      document.body.style.overflow = 'hidden';
      closeButtonRef.current?.focus();
    } else {
      document.body.style.overflow = '';
      if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === 'function') {
        previouslyFocusedElementRef.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
      if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === 'function') {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [isOpen]);

  // Detect platform once on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = window.navigator.userAgent.toLowerCase();
    let detected: PlatformType | 'desktop' = 'desktop';

    if (/android/i.test(ua)) {
      detected = 'android';
    } else if (/iphone|ipad|ipod/i.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)) {
      detected = 'ios';
    } else if (/windows/i.test(ua)) {
      detected = 'windows';
    } else if (/macintosh|mac os x/i.test(ua)) {
      detected = 'macos';
    } else if (/linux/i.test(ua)) {
      detected = 'linux';
    }

    setDetectedPlatform(detected);
    // Auto-select tab only for clearly detected mobile platforms.
    // Unknown/desktop environments keep the 'android' default so PWA is always first.
    if (detected === 'ios') {
      setActiveTab('ios');
    }
  }, []);

  // Handle focus trapping and Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements || focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Arrow key navigation between platform tabs (WAI-ARIA Tablist Pattern)
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const tabs: ModalPlatformTab[] = ['android', 'ios', 'desktop'];
    const currentIndex = tabs.indexOf(activeTab);
    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== currentIndex) {
      setActiveTab(tabs[nextIndex]);
      const nextTabEl = document.getElementById(`tab-${tabs[nextIndex]}`);
      nextTabEl?.focus();
    }
  };

  if (!isOpen) return null;

  // Artifact filters: Strictly enforce that only production-channel, available, direct-installable artifacts are exposed publicly.
  const isPublicArtifact = (art: any) =>
    (art.channel === 'production' || art.channel === 'stable') &&
    art.status === 'available' &&
    art.directInstallable === true;

  const androidArtifacts = (safeManifest.nativeArtifacts || []).filter(
    (a) => a.platform === 'android' && isPublicArtifact(a)
  );
  const androidStoreLinks = (safeManifest.storeLinks || []).filter((s) => s.platform === 'android');

  const iosArtifacts = (safeManifest.nativeArtifacts || []).filter(
    (a) => a.platform === 'ios' && isPublicArtifact(a)
  );
  const iosStoreLinks = (safeManifest.storeLinks || []).filter((s) => s.platform === 'ios');

  const desktopArtifacts = (safeManifest.nativeArtifacts || []).filter(
    (a) =>
      ['windows', 'macos', 'linux', 'desktop_windows', 'desktop_macos', 'desktop_linux'].includes(a.platform) &&
      isPublicArtifact(a)
  );

  const handlePwaInstall = async () => {
    if (!onPromptInstall) return;
    setPwaInstallStatus('installing');
    try {
      const outcome = await onPromptInstall();
      if (outcome === 'accepted') {
        setPwaInstallStatus('accepted');
      } else if (outcome === 'dismissed') {
        setPwaInstallStatus('dismissed');
      } else {
        setPwaInstallStatus('idle');
      }
    } catch {
      setPwaInstallStatus('idle');
    }
  };

  const handleDownloadClick = (filename: string) => {
    setDownloadFeedback(`Download initiated: ${filename}. Open the downloaded file on your device to install.`);
    setTimeout(() => setDownloadFeedback(null), 6000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-modal-title"
      aria-describedby="install-modal-description"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div
        ref={dialogRef}
        className="bg-[#FDFCF7] text-slate-800 rounded-2xl max-w-xl w-full p-5 sm:p-7 space-y-5 shadow-2xl border border-[#D5C4AA] relative my-auto"
      >
        {/* Header Strip */}
        <div className="flex items-start justify-between border-b border-[#E6DBCA] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="notebook-stamp px-2 py-0.5 text-[9px] font-bold rounded-xs tracking-wider">
                OFFLINE CASEWORK SUITE
              </span>
              {isStandalone && (
                <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Running in App
                </span>
              )}
            </div>
            <h2 id="install-modal-title" className="text-xl sm:text-2xl font-extrabold text-[#1A211E] tracking-tight mt-1.5">
              Install &amp; Download Childcare Support
            </h2>
            <p id="install-modal-description" className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Access the offline-first field notebook on your frontline phone, tablet, or workstation.
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 p-1.5 rounded-lg hover:bg-[#EFE6D8] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-700"
            aria-label="Close installation dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Selection Tabs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
              Select Device Platform:
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              Detected: <strong className="text-slate-800 capitalize">{detectedPlatform}</strong>
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Target platform selection"
            className="grid grid-cols-3 gap-2 bg-[#EFE6D8] p-1 rounded-xl border border-[#D5C4AA]"
          >
            {/* Android Tab */}
            <button
              id="tab-android"
              role="tab"
              aria-selected={activeTab === 'android'}
              aria-controls="panel-android"
              tabIndex={activeTab === 'android' ? 0 : -1}
              onClick={() => setActiveTab('android')}
              onKeyDown={handleTabKeyDown}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-700 ${
                activeTab === 'android'
                  ? 'bg-white text-emerald-900 shadow-xs border border-[#C5B396]'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
              <span>Android</span>
            </button>

            {/* iOS Tab */}
            <button
              id="tab-ios"
              role="tab"
              aria-selected={activeTab === 'ios'}
              aria-controls="panel-ios"
              tabIndex={activeTab === 'ios' ? 0 : -1}
              onClick={() => setActiveTab('ios')}
              onKeyDown={handleTabKeyDown}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-700 ${
                activeTab === 'ios'
                  ? 'bg-white text-emerald-900 shadow-xs border border-[#C5B396]'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Apple className="w-3.5 h-3.5 text-slate-700" />
              <span>iPhone / iPad</span>
            </button>

            {/* Desktop Tab */}
            <button
              id="tab-desktop"
              role="tab"
              aria-selected={activeTab === 'desktop'}
              aria-controls="panel-desktop"
              tabIndex={activeTab === 'desktop' ? 0 : -1}
              onClick={() => setActiveTab('desktop')}
              onKeyDown={handleTabKeyDown}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-700 ${
                activeTab === 'desktop'
                  ? 'bg-white text-emerald-900 shadow-xs border border-[#C5B396]'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Monitor className="w-3.5 h-3.5 text-slate-700" />
              <span>Desktop</span>
            </button>
          </div>
        </div>

        {/* ── Android Content Panel ── */}
        {activeTab === 'android' && (
          <div
            id="panel-android"
            role="tabpanel"
            aria-labelledby="tab-android"
            className="space-y-4"
          >
            {/* 1. Recommended PWA Method */}
            <div className="p-4 rounded-xl bg-white border border-[#DAC8B5] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                    RECOMMENDED (OFFLINE PWA)
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">Instant &amp; Light</span>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed font-normal">
                Installs directly to your Android home screen with zero play store friction. Operates fully offline with local encrypted caching.
              </p>

              {hasPrompt ? (
                <button
                  type="button"
                  onClick={handlePwaInstall}
                  disabled={pwaInstallStatus === 'installing' || pwaInstallStatus === 'accepted'}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#0F5132] hover:bg-[#0A3622] active:bg-[#072417] transition-all cursor-pointer shadow-xs focus:outline-none focus:ring-4 focus:ring-emerald-500/40"
                  aria-label="Install Web App (PWA)"
                >
                  <Download className="w-4 h-4 text-emerald-200" />
                  <span>
                    {pwaInstallStatus === 'accepted'
                      ? 'Web App Installation Prompt Accepted'
                      : pwaInstallStatus === 'installing'
                      ? 'Installing...'
                      : 'Install Web App (PWA)'}
                  </span>
                </button>
              ) : (
                <div className="p-3 rounded-lg bg-[#F8F5EE] border border-[#E2D5C3] text-xs text-slate-700 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Info className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                    <span>How to Add to Home Screen in Mobile Browsers</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1">
                    <li>In Chrome or Edge, tap the <strong>three dots (⋮)</strong> in the top-right.</li>
                    <li>Select <strong>&ldquo;Install app&rdquo;</strong> or <strong>&ldquo;Add to Home screen&rdquo;</strong>.</li>
                    <li>Confirm installation. The app icon will appear on your phone.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* 2. Direct Native APK (only if validated manifest supplies it) */}
            {androidArtifacts.length > 0 ? (
              <div className="p-4 rounded-xl bg-white border border-[#DAC8B5] shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      DIRECT APK DOWNLOAD
                    </span>
                    {(androidArtifacts[0].channel === 'internal' || androidArtifacts[0].channel === 'internal_test') && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300">
                        INTERNAL BUILD
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {formatFileSizeBytes(androidArtifacts[0].fileSizeBytes)}
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <p>
                    <strong>Version:</strong> {androidArtifacts[0].version?.startsWith('v') ? androidArtifacts[0].version : `v${androidArtifacts[0].version}`} •{' '}
                    <strong>Min OS:</strong> {androidArtifacts[0].minOsVersion}
                  </p>
                  {androidArtifacts[0].releaseNotes && (
                    <p className="text-slate-500 italic text-[11px]">
                      {androidArtifacts[0].releaseNotes}
                    </p>
                  )}
                </div>

                <a
                  href={androidArtifacts[0].downloadUrl}
                  download
                  onClick={() => handleDownloadClick('alliance-childcare-android.apk')}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 bg-[#EFE6D8] hover:bg-[#E5DACB] active:bg-[#DBCFB8] border border-[#D5C4AA] transition-all cursor-pointer focus:outline-none focus:ring-4 focus:ring-slate-400/40"
                  aria-label={`Download APK (${formatFileSizeBytes(androidArtifacts[0].fileSizeBytes)})`}
                >
                  <Download className="w-4 h-4 text-emerald-800" />
                  <span>Download APK</span>
                </a>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-[#F8F5EE] border border-dashed border-[#DAC8B5] text-xs text-slate-500 flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Native Google Play and APK packages are currently restricted to authorized internal pilots. Use the PWA above for full casework features.</span>
              </div>
            )}
          </div>
        )}

        {/* ── iOS / iPadOS Content Panel ── */}
        {activeTab === 'ios' && (
          <div
            id="panel-ios"
            role="tabpanel"
            aria-labelledby="tab-ios"
            className="space-y-4"
          >
            {/* Safari Add-to-Home-Screen Instructions */}
            <div className="p-4 rounded-xl bg-white border border-[#DAC8B5] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                  IPHONE &amp; IPAD INSTALLATION (SAFARI)
                </span>
                <span className="text-[11px] text-slate-500 font-mono">No App Store Login Required</span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Apple iOS requires adding PWAs to your Home Screen from Safari. Follow these three quick steps:
              </p>

              <ol className="space-y-2.5 text-xs text-slate-700">
                <li className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="font-bold font-mono text-emerald-700">1.</span>
                  <span>
                    Tap the Share button (the square with an upward arrow at the bottom of the Safari screen).
                  </span>
                </li>
                <li className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="font-bold font-mono text-emerald-700">2.</span>
                  <span>
                    Scroll down and tap &quot;Add to Home Screen&quot;.
                  </span>
                </li>
                <li className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="font-bold font-mono text-emerald-700">3.</span>
                  <span>
                    Tap Add in the top right corner. The Childcare icon is now installed.
                  </span>
                </li>
              </ol>
            </div>

            {/* TestFlight or App Store links if supplied by manifest */}
            {iosStoreLinks.length > 0 ? (
              <div className="p-4 rounded-xl bg-white border border-[#DAC8B5] shadow-xs space-y-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  TESTFLIGHT PREVIEW
                </span>
                <p className="text-xs text-slate-600">
                  For iOS supervision devices enrolled in TestFlight testing:
                </p>
                <a
                  href={iosStoreLinks[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950 underline underline-offset-4"
                >
                  <span>Open {iosStoreLinks[0].label}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-[#F8F5EE] border border-dashed border-[#DAC8B5] text-xs text-slate-500 flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Public Apple App Store listings are not active. The Safari Home Screen workflow above provides the verified production release.</span>
              </div>
            )}
          </div>
        )}

        {/* ── Desktop Content Panel ── */}
        {activeTab === 'desktop' && (
          <div
            id="panel-desktop"
            role="tabpanel"
            aria-labelledby="tab-desktop"
            className="space-y-4"
          >
            {/* Desktop PWA Installation */}
            <div className="p-4 rounded-xl bg-white border border-[#DAC8B5] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                  BROWSER / DESKTOP PWA
                </span>
                <span className="text-[11px] text-slate-500 font-mono">Windows • macOS • Linux</span>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed font-normal">
                Install on Windows, macOS or Linux — run Childcare Support in its own dedicated, lightweight window with offline support on your desktop or laptop.
              </p>

              {hasPrompt ? (
                <button
                  type="button"
                  onClick={handlePwaInstall}
                  disabled={pwaInstallStatus === 'installing' || pwaInstallStatus === 'accepted'}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#0F5132] hover:bg-[#0A3622] active:bg-[#072417] transition-all cursor-pointer shadow-xs focus:outline-none focus:ring-4 focus:ring-emerald-500/40"
                  aria-label="Install Desktop App"
                >
                  <Download className="w-4 h-4 text-emerald-200" />
                  <span>
                    {pwaInstallStatus === 'accepted'
                      ? 'App Installed on Desktop!'
                      : pwaInstallStatus === 'installing'
                      ? 'Installing...'
                      : 'Install Desktop Window'}
                  </span>
                </button>
              ) : (
                <div className="p-3 rounded-lg bg-[#F8F5EE] border border-[#E2D5C3] text-xs text-slate-700 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Info className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                    <span>How to Install on Desktop</span>
                  </div>
                  <p className="text-slate-600">
                    In <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, or <strong>Brave</strong>, click the <strong>Install icon (computer/down-arrow)</strong> on the right side of the URL address bar, or select <strong>&ldquo;Install Childcare Support...&rdquo;</strong> from the browser menu.
                  </p>
                </div>
              )}
            </div>

            {/* Native Desktop Installers (only if manifest supplies them) */}
            {desktopArtifacts.length > 0 ? (
              <div className="p-4 rounded-xl bg-white border border-[#DAC8B5] shadow-xs space-y-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-300">
                  STANDALONE DESKTOP PACKAGES
                </span>
                <div className="space-y-2">
                  {desktopArtifacts.map((art, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-800 capitalize">
                          {art.platform} ({art.architecture}) • {art.version}
                        </p>
                        <p className="text-[11px] text-slate-500">Min OS: {art.minOsVersion}</p>
                      </div>
                      <a
                        href={art.downloadUrl}
                        download
                        onClick={() => handleDownloadClick(`alliance-childcare-${art.platform}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EFE6D8] hover:bg-[#E5DACB] text-slate-800 font-bold border border-[#D5C4AA]"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-800" />
                        <span>{formatFileSizeBytes(art.fileSizeBytes)}</span>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-[#F8F5EE] border border-dashed border-[#DAC8B5] text-xs text-slate-500 flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Packaged MSI/DMG installers are currently unreleased. The Desktop PWA provides identical offline casework capabilities.</span>
              </div>
            )}
          </div>
        )}

        {/* User Feedback Toast inside dialog */}
        {downloadFeedback && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-2 shadow-xs"
          >
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{downloadFeedback}</span>
          </div>
        )}

        {/* Footer: Always Retain "Continue in browser" */}
        <div className="border-t border-[#E6DBCA] pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link
            href="/app"
            onClick={onClose}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-emerald-900 bg-[#E8DEC8] hover:bg-[#DFCFA8] active:bg-[#D5C4AA] border border-[#C5B396] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-700"
            aria-label="Continue in browser to field workspace"
          >
            <span>Continue in browser (/app)</span>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-800" />
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
