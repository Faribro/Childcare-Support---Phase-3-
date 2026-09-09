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
  FileText,
  Edit3,
  Camera,
  AlertTriangle,
  RefreshCw,
  History,
  UploadCloud,
  Trash2,
  BookOpen,
} from 'lucide-react';
import { usePwaInstall } from '@/lib/pwa/usePwaInstall';

type GuideTrackId = 'lifecycle' | 'drafts' | 'editing' | 'install';

export default function LandingPage() {
  const router = useRouter();
  const { canInstall, isStandalone, isIos, promptInstall } = usePwaInstall();
  const [showIosModal, setShowIosModal] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<GuideTrackId>('lifecycle');
  const [activeStepIndex, setActiveStepIndex] = useState(0);

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

  const guideTracks = [
    {
      id: 'lifecycle' as GuideTrackId,
      tabLabel: '📋 Form Open to Submission',
      shortLabel: 'Form Lifecycle',
      badge: 'Standard Field Protocol',
      title: 'Complete Survey Lifecycle: Form Open to Final Submission',
      description:
        'A systematic frontline workflow for opening new assessments, collecting spoken audio consent, recording clinical MUAC & WHO metrics, capturing doorstep GPS, and submitting securely into local offline storage.',
      quickBanner: {
        title: '6 Assessment Sections + Local Cryptographic Submission',
        description:
          'Frontline staff can complete an entire child evaluation in 7–10 minutes. Every section validates inputs on device without requiring internet connectivity.',
        tags: ['Zero Data Loss', 'Audio Consent', 'Sub-10m GPS', 'Instant WHO Z-Scores'],
      },
      steps: [
        {
          id: '01',
          badge: 'Step 1 • Dashboard to Form',
          title: 'Tap "+ New Child Survey" & Generate Intake ID',
          summary:
            'Frontline workers start by tapping the large teal button on the home dashboard. The app automatically creates a tamper-proof Intake Reference ID (e.g. DL-SOU-091639-01) and prepares the offline workspace.',
          frontlineAction:
            'Tap "+ New Child Survey". The 6-section form opens immediately, even in Airplane mode.',
          smartBehavior:
            'Generates unique client-side UUID and timestamp, and initializes atomic local storage transactions.',
          proTip:
            'Note down the last 4 digits of the unique intake ID in your field register for quick cross-referencing.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'Dashboard with New Child Survey Initiation',
        },
        {
          id: '02',
          badge: 'Step 2 • Informed Consent',
          title: 'Spoken Audio Consent in Local Language & Digital Signature',
          summary:
            'Ensure illiterate or semi-literate mothers and caregivers understand why the survey is conducted and how nutrition benefits will reach their child.',
          frontlineAction:
            'Tap "Play Audio Consent" to let the caregiver listen in Hindi, Marathi, Telugu, Tamil, or English. Select "Yes — Consent Granted" and have the caregiver draw their signature or initial on the touch pad.',
          smartBehavior:
            'Embeds digital signature blob, locks informed consent validation, and stores confirmation timestamp in phone memory.',
          proTip:
            'If the caregiver cannot write, they can touch the screen with an initial or mark with verified guardian presence.',
          imageSrc: '/images/guide/audio-consent.png',
          imageAlt: 'Multilingual Audio Consent and Digital Signature Pad',
        },
        {
          id: '03',
          badge: 'Step 3 • Profile & Location',
          title: 'Child Profile, Age Verification & Doorstep Landmark',
          summary:
            'Enter child name, birth date, gender, orphan status, and capture doorstep GPS within 10 meters with prominent landmarks.',
          frontlineAction:
            'Type child and caregiver details. Tap "Fetch Live Address". The button displays "Fetching…" then automatically fills the state, district, and nearby landmark (e.g. "Near Chaar Sahibzaade Gurudwara").',
          smartBehavior:
            'Multi-provider reverse geocoder resolves verified Indian addresses using satellite GPS and cached maps without manual typing.',
          proTip:
            'If inside a dense concrete room, take two steps onto the veranda for 3-second satellite lock.',
          imageSrc: '/images/guide/location-capture.png',
          imageAlt: 'Accurate Live Address and GPS Pinpoint',
        },
        {
          id: '04',
          badge: 'Step 4 • Clinical Nutrition',
          title: 'Weight, Height & Color-Coded MUAC Tape Scoring',
          summary:
            'Enter clinical measurements to immediately classify the child\'s malnutrition level according to World Health Organization standards.',
          frontlineAction:
            'Measure weight in kg and height in cm. Wrap the MUAC tape around the child\'s left mid-upper arm and select the color: Green (Normal), Yellow (MAM), or Red (SAM).',
          smartBehavior:
            'Calculates WHO Z-scores in real-time (Weight-for-Age, Height-for-Age, BMI) and immediately triggers referral flags for SAM cases.',
          proTip:
            'Remove child shoes and heavy jackets before weighing for exact clinical precision.',
          imageSrc: '/images/guide/location-capture.png',
          imageAlt: 'Clinical Anthropometry and MUAC Scoring',
        },
        {
          id: '05',
          badge: 'Step 5 • Family Assessment',
          title: 'Family Income, Livelihood & Vulnerability Status',
          summary:
            'Capture household size, number of minor children, monthly family income, and main livelihood source (e.g. Daily wage labour).',
          frontlineAction:
            'Select household members and primary income source from the dropdown to evaluate poverty and nutritional vulnerability.',
          smartBehavior:
            'Calculates dependency ratios and links socio-economic data with clinical severity scores.',
          proTip:
            'Ask about daily wage fluctuations to record average monthly household earnings accurately.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'Household Demographics and Vulnerability',
        },
        {
          id: '06',
          badge: 'Step 6 • Education Support',
          title: 'School Attendance, Annual Expenses & Required Aid',
          summary:
            'Record current school grade, attendance regularity, and calculate required support for school fees, books, uniforms, and transport.',
          frontlineAction:
            'Fill in annual school expenses and mark the required financial aid needed by the family to keep the child in school.',
          smartBehavior:
            'Calculates total annual education cost and required support totals automatically.',
          proTip:
            'Attach fee slips or receipts if available using the photo upload button.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'Education Status and Required Support',
        },
        {
          id: '07',
          badge: 'Step 7 • Verification & Submit',
          title: 'Document Photos, Caseworker Sign-Off & Queueing',
          summary:
            'Photograph KYC documents with automated Aadhaar masking, certify data accuracy, and submit into the offline sync queue.',
          frontlineAction:
            'Take clear photos of Passbook Front Page, Child Photo, and Aadhaar Card. Check "Yes — Verified", enter caseworker name, and tap "Submit Survey".',
          smartBehavior:
            'Encrypts data, saves to IndexedDB, displays green success confirmation, and places record in "Waiting to be Sent" queue.',
          proTip:
            'Once submitted, the survey is safely recorded on the device and will sync automatically when internet is available.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'Caseworker Verification and Local Offline Submission',
        },
      ],
    },
    {
      id: 'drafts' as GuideTrackId,
      tabLabel: '💾 Managing Local Drafts',
      shortLabel: 'Local Drafts',
      badge: 'Autosave & Resume Guide',
      title: 'Managing Local In-Progress Drafts (Zero Data Loss)',
      description:
        'How continuous background autosave protects your work, how to pause during busy field visits, resume seamlessly, and clean up test drafts without network dependency.',
      quickBanner: {
        title: 'Pause Anywhere, Resume Anytime — Guaranteed Zero Data Loss',
        description:
          'Frontline home visits are frequently interrupted. The Alliance India PWA automatically caches every field change into internal IndexedDB memory.',
        tags: ['Instant Autosave', 'Offline Drafts', 'One-Tap Resume', 'Safe Cleanup'],
      },
      steps: [
        {
          id: '01',
          badge: 'Step 1 • Background Autosave',
          title: 'Every Keystroke Saved Instantly in Local Storage',
          summary:
            'Never fear phone reboots, dead batteries, or browser crashes. Every typed character, dropdown selection, and photo is persisted within milliseconds into IndexedDB.',
          frontlineAction:
            'Fill the form at your own pace. You never need to look for a "Save" button after typing or making selections.',
          smartBehavior:
            'Runs atomic IndexedDB transactions in the background with zero lag and zero network usage.',
          proTip:
            'You can safely turn off your phone or switch apps to take a call; your data is 100% safe.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'Automatic Local Storage Persistence',
        },
        {
          id: '02',
          badge: 'Step 2 • Field Pausing',
          title: 'Safe Pausing When Mother or Child is Busy',
          summary:
            'Field visits often face interruptions — an infant crying, feeding time, or a caregiver stepping out to fetch water.',
          frontlineAction:
            'Tap "Save Draft" at the top of the form, or simply close your browser window. Your draft is automatically saved in its current state.',
          smartBehavior:
            'Tracks exact completion progress (e.g. 45% complete) and records the last active section visited.',
          proTip:
            'Tell the mother you will return later that afternoon; you won\'t have to re-ask any answered questions.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'Safe In-Progress Draft Pausing',
        },
        {
          id: '03',
          badge: 'Step 3 • Dashboard Registry',
          title: '"My In-Progress Drafts" Registry on Dashboard',
          summary:
            'All pending unsubmitted surveys are prominently displayed in the "My In-Progress Drafts" section on your main home dashboard.',
          frontlineAction:
            'Open the app home screen. Scroll down to view all saved drafts showing child name, date, and unique intake reference.',
          smartBehavior:
            'Renders draft cards sorted by most recent activity, displaying progress badges and last saved timestamps.',
          proTip:
            'If a draft is unnamed, it displays the temporary intake reference so you can easily identify it.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'My In-Progress Drafts on App Home Screen',
        },
        {
          id: '04',
          badge: 'Step 4 • Resume Survey',
          title: 'Tap "Resume Intake >" to Jump Right Back In',
          summary:
            'One tap instantly reloads the draft with all entered answers, signatures, photos, and GPS landmarks intact.',
          frontlineAction:
            'Tap "Resume Intake >" on the draft card. The form reopens at the exact section where you left off.',
          smartBehavior:
            'Rehydrates the full 6-section form state, signature, and photos from IndexedDB within 0.2 seconds.',
          proTip:
            'You can review and update previously entered answers before completing the final submission.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: '1-Tap Resume Intake into Active Form',
        },
        {
          id: '05',
          badge: 'Step 5 • Storage Hygiene',
          title: 'Safe Deletion of Duplicate or Accidental Drafts',
          summary:
            'Frontline workers can safely remove accidental test entries or duplicate drafts to keep their phone workspace tidy.',
          frontlineAction:
            'Tap the red trash icon on the draft card. Confirm the prompt to delete the draft.',
          smartBehavior:
            'Completely removes the draft record and frees up device photo cache storage without affecting submitted surveys.',
          proTip:
            'Only delete drafts you are certain you do not need, as deleted drafts cannot be recovered.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'Safe Draft Deletion Confirmation Dialog',
        },
      ],
    },
    {
      id: 'editing' as GuideTrackId,
      tabLabel: '✏️ Editing Submitted Surveys & Replacing Documents',
      shortLabel: 'Edit & Replace Documents',
      badge: 'Post-Submission Amendment Protocol',
      title: 'How to Edit Submitted Surveys & Replace Incorrect Documents',
      description:
        'Step-by-step instructions for fixing common field mistakes: replacing blurry passbook photos, uploading correct Aadhaar cards, fixing child weight/height typos, adding mandatory audit notes, and saving revisions.',
      quickBanner: {
        title: 'Frontline Quality Control & Document Replacement',
        description:
          'Uploaded a blurry passbook or incorrect Aadhaar? Frontline caseworkers can easily update submitted assessments without losing previous history.',
        tags: ['Photo Replacement', 'Typo Corrections', 'Audit Trail', 'Revision v2/v3'],
      },
      steps: [
        {
          id: '01',
          badge: 'Step 1 • When to Edit',
          title: 'Common Field Scenarios Requiring Amendments',
          summary:
            'During rapid field surveys, mistakes happen: (1) The bank passbook photo was blurry or obscured the IFSC code, (2) The wrong child\'s Aadhaar card was photographed, (3) A typo was made in child weight or height, or (4) The caregiver provided a new bank account number.',
          frontlineAction:
            'Check your submitted assessments. If any document is illegible or details need updating, initiate the amendment workflow.',
          smartBehavior:
            'Supports Optimistic Concurrency Control (OCC) and versioning (v1 → v2) so supervisor records stay synchronized.',
          proTip:
            'Review photos immediately after submission on the "Submitted Surveys" page to catch blurry shots before leaving the village.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'Field Scenarios Requiring Document Correction',
        },
        {
          id: '02',
          badge: 'Step 2 • Access Submissions',
          title: 'Go to "Submitted Surveys" via Top Navigation',
          summary:
            'All submitted assessments — whether already synced to cloud or pending in the local queue — are listed in the Submitted Surveys registry.',
          frontlineAction:
            'Tap "Submitted Surveys" in the top masthead, or click the "Waiting to be Sent" / "Synced" queue card on your home dashboard.',
          smartBehavior:
            'Aggregates both local IndexedDB queue items and remote cloud submissions into a unified search and filter list.',
          proTip:
            'Use the search bar to type the child\'s name or ART ID to find the record in 1 second.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'Submitted Surveys List in Field Workspace',
        },
        {
          id: '03',
          badge: 'Step 3 • Launch Editor',
          title: 'Tap "Edit" or "View Submission → Edit"',
          summary:
            'Launch the full 9-section comprehensive amendment editor preloaded with all beneficiary data, measurements, and current documents.',
          frontlineAction:
            'On the beneficiary card, tap the "Edit" button (or tap "View", review the submission summary modal, and click "Edit Submission").',
          smartBehavior:
            'Routes to /assessment/record/[id]/edit, pre-populates all 73 clinical and demographic fields, and locks base version v1.',
          proTip:
            'Notice the top badge showing Base Version: v1 and Submitting: Revision v2.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'Edit Assessment Form Header with Revision Tracker',
        },
        {
          id: '04',
          badge: 'Step 4 • Replace Photo',
          title: 'Tap "Replace Photo" on Passbook, Aadhaar, or Child Photo',
          summary:
            'Replacing an illegible or wrong document takes just one tap without starting the survey over.',
          frontlineAction:
            'Scroll to Section 3 (Banking & KYC Documents). On the document that needs correction (Passbook, Aadhaar, or Child Photo), tap the "Replace Photo" button. Take a fresh clear camera photo or select from phone gallery.',
          smartBehavior:
            'Instantly replaces the document preview, updates the encrypted image cache, and links the new file to the amendment payload.',
          proTip:
            'For bank passbooks, ensure the account holder name, account number, and 11-digit IFSC code (e.g. SBIN0001234) are sharp and readable.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'Document Replacement with Camera and Photo Upload',
        },
        {
          id: '05',
          badge: 'Step 5 • Update Details',
          title: 'Correct Demographics, Anthropometrics & Banking Details',
          summary:
            'Fix child birthdate, height, weight, school fees, or bank account numbers.',
          frontlineAction:
            'Click into the input field needing correction. If updating height or weight, observe the WHO Z-scores recalculate immediately.',
          smartBehavior:
            'Re-validates Indian phone numbers, IFSC formats, and WHO nutritional z-scores in real time.',
          proTip:
            'Always confirm that the bank account holder name matches the caregiver\'s name on the new passbook photo.',
          imageSrc: '/images/guide/location-capture.png',
          imageAlt: 'Real-time Anthropometric Re-scoring in Edit Mode',
        },
        {
          id: '06',
          badge: 'Step 6 • Mandatory Audit Note',
          title: 'Enter "Reason for Amendment" & Save Revision (v2, v3)',
          summary:
            'Frontline accountability requires an audit reason before submitting changes to protect data integrity.',
          frontlineAction:
            'In the "Reason for Amendment / Revision Note" box, type a clear note (e.g. "Replaced blurry bank passbook with clear photo showing IFSC SBIN0001234"). Then tap "Save & Submit Revision".',
          smartBehavior:
            'Increments the revision version (v1 → v2), saves locally, and queues the amendment into the cloud sync queue for supervisor review.',
          proTip:
            'Clear audit notes help supervisors approve Direct Benefit Transfers (DBT) faster without sending records back for re-verification.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'Revision Reason Box and Save Submit Button',
        },
      ],
    },
    {
      id: 'install' as GuideTrackId,
      tabLabel: '📲 Installation & Offline Readiness',
      shortLabel: 'Install & Offline',
      badge: 'Device Setup & Airplane Mode',
      title: 'PWA Installation & 100% Airplane Mode Setup',
      description:
        'Zero-barrier installation on budget Android and Apple iOS devices without Google Play Store or Apple ID hurdles, plus zero-connectivity village operations.',
      quickBanner: {
        title: 'Zero App Store Barrier • Installed in 5 Seconds',
        description:
          'Download directly on any Android smartphone, tablet, or iPhone. The application caches everything locally so you can work anywhere.',
        tags: ['No Google Account', 'No Apple ID', '100% Airplane Mode', 'Auto Cloud Sync'],
      },
      steps: [
        {
          id: '01',
          badge: 'Step 1 • Android Setup',
          title: '1-Tap PWA Installation (Zero Play Store Barrier)',
          summary:
            'No Google Play Store account or password required. Frontline staff can install the app directly on any budget Android phone or tablet in just 5 seconds.',
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
          badge: 'Step 2 • Apple iOS Setup',
          title: '3-Step Installation on iPhone / iPad (Safari)',
          summary:
            'Apple iOS requires adding PWAs to the home screen directly through Safari without requiring an Apple App Store download.',
          frontlineAction:
            'Open this page in Safari. Tap the Share icon (square with up arrow), scroll down, tap "Add to Home Screen", then tap "Add".',
          smartBehavior:
            'Enables full-screen standalone execution without browser address bars or navigation chrome.',
          proTip:
            'Always launch the app from your home screen icon for full offline caching benefits.',
          imageSrc: '/images/guide/dashboard-preview.png',
          imageAlt: 'iOS Safari Add to Home Screen Instructions',
        },
        {
          id: '03',
          badge: 'Step 3 • Offline First',
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
          id: '04',
          badge: 'Step 4 • Auto Cloud Sync',
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
      ],
    },
  ];

  const currentTrack = guideTracks.find((t) => t.id === activeTrackId) || guideTracks[0];
  const currentStep = currentTrack.steps[activeStepIndex] || currentTrack.steps[0];

  const handleTabChange = (trackId: GuideTrackId) => {
    setActiveTrackId(trackId);
    setActiveStepIndex(0);
  };

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

          {/* Primary Action Buttons - Download Only */}
          <div className="pt-2 flex items-center justify-center">
            <button
              type="button"
              onClick={handleDownloadClick}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md hover:shadow-xl transition-all transform hover:-translate-y-0.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download &amp; Install PWA</span>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                Free • 0 MB
              </span>
            </button>
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
                          Field Application Workspace
                        </p>
                        <p className="text-sm sm:text-base font-extrabold">
                          Child Nutrition &amp; Support Form
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white/20 backdrop-blur-xs text-white border border-white/30">
                        Unlocked Upon Download
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Frontline Field Staff Operational Guide (Comprehensive Multi-Track Handbook) ── */}
      <section id="operational-guide" className="py-16 sm:py-24 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold uppercase tracking-wider">
              Field Staff Operational Handbook
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Systematic Field Operations &amp; Form Guide
            </h2>
            <p className="text-sm sm:text-base text-slate-600 font-normal">
              Clear, jargon-free instructions covering end-to-end surveys, managing local drafts, and editing submitted records with document replacement.
            </p>
          </div>

          {/* ── 4 Interactive Operational Tracks Navigation Tabs ── */}
          <div className="flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-200/80">
            {guideTracks.map((track) => {
              const isSelected = activeTrackId === track.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => handleTabChange(track.id)}
                  className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold shrink-0 transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
                    isSelected
                      ? 'border-teal-600 text-teal-900 bg-teal-50/60 shadow-2xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <span>{track.tabLabel}</span>
                </button>
              );
            })}
          </div>

          {/* ── Active Track Context Banner ── */}
          <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-[11px] font-semibold">
                {currentTrack.badge}
              </div>
              <h3 className="text-lg sm:text-xl font-bold">{currentTrack.title}</h3>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                {currentTrack.description}
              </p>
            </div>

            {/* Micro Tags */}
            {currentTrack.quickBanner && (
              <div className="flex flex-wrap md:flex-col gap-1.5 shrink-0">
                {currentTrack.quickBanner.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 text-[11px] font-medium text-teal-200 border border-white/10"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>{tag}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Dedicated Visual Scenario Callout for Document Replacement ── */}
          {activeTrackId === 'editing' && (
            <div className="p-5 rounded-2xl bg-amber-50/90 border border-amber-300/80 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Quick Scenario: Replacing an Incorrect or Blurry Document</span>
              </div>
              <p className="text-xs text-amber-950 leading-relaxed">
                If an Anganwadi worker or field coordinator accidentally uploaded a blurry bank passbook or wrong Aadhaar card during intake:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                <div className="bg-white p-3 rounded-xl border border-amber-200 text-xs space-y-1 shadow-2xs">
                  <span className="font-bold text-amber-900 font-mono text-[10px]">STEP 1</span>
                  <p className="font-semibold text-slate-900">Open Submitted Surveys</p>
                  <p className="text-[11px] text-slate-600">Tap top nav &quot;Submitted Surveys&quot; to locate the child&apos;s record.</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-amber-200 text-xs space-y-1 shadow-2xs">
                  <span className="font-bold text-amber-900 font-mono text-[10px]">STEP 2</span>
                  <p className="font-semibold text-slate-900">Tap &quot;Edit&quot;</p>
                  <p className="text-[11px] text-slate-600">Open the 9-section amendment workspace preloaded with current data.</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-amber-200 text-xs space-y-1 shadow-2xs">
                  <span className="font-bold text-amber-900 font-mono text-[10px]">STEP 3</span>
                  <p className="font-semibold text-slate-900">Tap &quot;Replace Photo&quot;</p>
                  <p className="text-[11px] text-slate-600">Snap a sharp new camera image showing clear bank IFSC &amp; account number.</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-amber-200 text-xs space-y-1 shadow-2xs">
                  <span className="font-bold text-amber-900 font-mono text-[10px]">STEP 4</span>
                  <p className="font-semibold text-slate-900">Save Revision (v2)</p>
                  <p className="text-[11px] text-slate-600">Type a brief audit note and tap &quot;Save &amp; Submit Revision&quot;.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Interactive Step Selector Pills for Active Track ── */}
          <div className="flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {currentTrack.steps.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStepIndex(idx)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeStepIndex === idx
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span className="opacity-80 font-mono text-[10px]">#{s.id}</span>
                <span>{s.badge.split('•')[1]?.trim() || s.badge}</span>
              </button>
            ))}
          </div>

          {/* ── Active Step Deep Dive Card ── */}
          {currentStep && (
            <div className="bg-slate-50 border border-slate-200/90 rounded-3xl p-6 sm:p-8 lg:p-10 shadow-xs grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-300">
              {/* Left Column: Clear Step Instructions */}
              <div className="lg:col-span-6 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-100/70 text-teal-900 text-xs font-bold font-mono">
                  {currentStep.badge}
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
                  {currentStep.title}
                </h3>

                <p className="text-sm text-slate-600 leading-relaxed font-normal">
                  {currentStep.summary}
                </p>

                {/* Frontline Action Card */}
                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5 shadow-2xs">
                  <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider block">
                    👉 What You Do (Frontline Action):
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {currentStep.frontlineAction}
                  </p>
                </div>

                {/* Smart PWA Behavior Card */}
                <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200/70 space-y-1.5 shadow-2xs">
                  <span className="text-[11px] font-bold text-teal-900 uppercase tracking-wider block">
                    ⚡ What the App Does Automatically:
                  </span>
                  <p className="text-xs text-teal-950 leading-relaxed">
                    {currentStep.smartBehavior}
                  </p>
                </div>

                {/* Golden Field Pro-Tip */}
                <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 space-y-1.5 shadow-2xs">
                  <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                    💡 Field Worker Golden Tip:
                  </span>
                  <p className="text-xs text-amber-950 leading-relaxed">
                    {currentStep.proTip}
                  </p>
                </div>
              </div>

              {/* Right Column: Visual Screenshot & Step Walkthrough */}
              <div className="lg:col-span-6 space-y-4">
                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-slate-300 shadow-md bg-white">
                  <Image
                    src={currentStep.imageSrc}
                    alt={currentStep.imageAlt}
                    fill
                    className="object-contain p-2 bg-slate-100"
                  />
                </div>

                {/* Step Progress Controls */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveStepIndex((prev) =>
                        prev > 0 ? prev - 1 : currentTrack.steps.length - 1
                      )
                    }
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
                  >
                    ← Previous Step
                  </button>

                  <span className="text-xs font-mono text-slate-500 font-semibold">
                    Step {activeStepIndex + 1} of {currentTrack.steps.length}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setActiveStepIndex((prev) =>
                        prev < currentTrack.steps.length - 1 ? prev + 1 : 0
                      )
                    }
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
                <span>How do I replace a blurry document or incorrect photo after submitting?</span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="pt-2 leading-relaxed text-slate-600 font-normal">
                Go to &ldquo;Submitted Surveys&rdquo; in the top navigation, locate the child&apos;s record, and tap &ldquo;Edit&rdquo;. Scroll down to Section 3 (Banking &amp; KYC Documents) and tap &ldquo;Replace Photo&rdquo; on the blurry document. Snap a new, clear photo in good lighting, enter a brief &ldquo;Reason for Amendment&rdquo; note at the top, and tap &ldquo;Save &amp; Submit Revision&rdquo;. The system increments the version (v2) and queues the updated file for cloud sync.
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
          <div className="pt-2 flex items-center justify-center">
            <button
              type="button"
              onClick={handleDownloadClick}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-xs font-bold text-slate-900 bg-teal-400 hover:bg-teal-300 transition-all cursor-pointer shadow-md"
            >
              <Download className="w-4 h-4" />
              <span>Download PWA to Device</span>
            </button>
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
                onClick={() => setShowIosModal(false)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 transition-colors cursor-pointer"
              >
                Got It, Close Guide
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
