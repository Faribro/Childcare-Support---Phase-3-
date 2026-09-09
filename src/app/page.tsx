'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  Smartphone,
  Layers,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Activity,
  Award,
  Globe,
  X,
  Share2,
  Check,
  FileText,
  Edit3,
  Camera,
  AlertTriangle,
  RefreshCw,
  History,
  UploadCloud,
  Trash2,
  Bookmark,
  UserCheck,
  Lightbulb,
  Cpu,
  Lock,
  ArrowUpRight,
  Building2,
  ClipboardCheck,
  ChevronDown,
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
  const stepScrollRef = useRef<HTMLDivElement>(null);

  const scrollSteps = (direction: 'left' | 'right') => {
    if (stepScrollRef.current) {
      const scrollAmount = 260;
      stepScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  // Smoothly center the active step pill when selected or progressed
  useEffect(() => {
    if (stepScrollRef.current) {
      const activeEl = stepScrollRef.current.children[activeStepIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeStepIndex]);

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
      tabLabel: 'Survey Workflow',
      shortLabel: 'Survey Workflow',
      iconName: 'FileText',
      badge: 'Step-by-Step Field Intake',
      title: 'Conducting a Household Assessment: From Start to Submission',
      description:
        'A practical guide for visiting a family, explaining consent in their language, measuring child nutrition status, and recording household details on your phone.',
      quickBanner: {
        title: 'Core 6-Section Assessment Workflow',
        description:
          'Takes 7 to 10 minutes per household. Every section saves directly to your device so you can work completely offline.',
        tags: ['Audio consent in 5 languages', 'Automatic doorstep GPS', 'Anthropometric indicators', 'Zero data loss'],
      },
      steps: [
        {
          id: '01',
          badge: 'Step 1 • Starting the Assessment',
          title: 'Open Form & Generate Secure Intake ID',
          summary:
            'Start a new assessment by tapping "+ New Child Survey" on your home screen. The app automatically creates a unique intake code to identify the child across visits.',
          frontlineAction:
            'Tap the blue "+ New Child Survey" card. The assessment form opens immediately, even if your phone has no internet connection.',
          smartBehavior:
            'Assigns a permanent intake ID (such as DL-SOU-091639-01) and opens an encrypted local record in your phone memory.',
          proTip:
            'You can write down the 4-digit code at the end of the intake ID in your field diary for easy cross-referencing.',
          imageSrc: '/images/guide/step-dashboard.png',
          imageAlt: 'Field workspace dashboard with new survey action',
        },
        {
          id: '02',
          badge: 'Step 2 • Consent & Rights',
          title: 'Audio Consent in Local Language & Signature',
          summary:
            'Before asking questions, play the spoken consent audio to the mother or guardian so they understand how their family details will be protected and used for nutrition support.',
          frontlineAction:
            'Tap "Play Audio Consent" to let the mother listen in Hindi, Marathi, Telugu, Tamil, or English. If she agrees, select "Yes — Consent Granted" and have her sign or initial on the screen.',
          smartBehavior:
            'Stores the digital signature securely in phone memory along with the exact date, time, and language selected.',
          proTip:
            'If a caregiver cannot sign, she can provide a clear mark or initial on the touch pad with a witness present.',
          imageSrc: '/images/guide/step-consent.png',
          imageAlt: 'Audio consent notice and signature canvas',
        },
        {
          id: '03',
          badge: 'Step 3 • Child & Doorstep Location',
          title: 'Child Demographics & Doorstep GPS Pinpoint',
          summary:
            'Record the child\'s name, date of birth, and gender. Tap the location button to record the doorstep position with nearby landmark reference.',
          frontlineAction:
            'Enter the child and caregiver information. Tap "Fetch Live Address" to let the phone find your GPS position and the nearest landmark (such as "Near Chaar Sahibzaade Gurudwara").',
          smartBehavior:
            'Combines satellite GPS with offline map data to identify the location within 10 meters without requiring a postal house number.',
          proTip:
            'If you are sitting under a heavy metal or concrete roof, step two paces outside onto the porch for a quick 3-second GPS lock.',
          imageSrc: '/images/guide/step-location.png',
          imageAlt: 'Demographics and automatic doorstep GPS pinpoint',
        },
        {
          id: '04',
          badge: 'Step 4 • Nutrition Measurements',
          title: 'Height, Weight & Mid-Upper Arm Circumference (MUAC)',
          summary:
            'Measure the child\'s physical growth. The app calculates nutrition indicators to detect acute malnutrition early.',
          frontlineAction:
            'Enter weight in kilograms and height in centimeters. Wrap the MUAC tape around the left mid-upper arm and choose the color: Green (Normal), Yellow (MAM), or Red (SAM).',
          smartBehavior:
            'Instantly calculates anthropometric percentiles (Weight-for-Age, Height-for-Age, BMI) and alerts you if the child needs immediate nutritional referral.',
          proTip:
            'Ensure the child removes shoes and heavy outer clothing before stepping on the weighing scale for accuracy.',
          imageSrc: '/images/guide/step-clinical.png',
          imageAlt: 'Clinical nutrition measurements and MUAC tape scoring',
        },
        {
          id: '05',
          badge: 'Step 5 • Household Assessment',
          title: 'Family Members, Living Conditions & Income',
          summary:
            'Ask about the family composition, total number of children, and primary income source to understand vulnerability.',
          frontlineAction:
            'Select the family size and main income source (such as daily wage labour or agriculture) from the simple dropdown menus.',
          smartBehavior:
            'Summarizes household dependency indicators to help supervisors prioritize high-need families for food baskets.',
          proTip:
            'For daily wage families whose earnings change week to week, estimate the average income over the last month.',
          imageSrc: '/images/guide/step-household.png',
          imageAlt: 'Household socio-economic details and income source',
        },
        {
          id: '06',
          badge: 'Step 6 • Schooling & Support Required',
          title: 'School Attendance & Education Aid Schedule',
          summary:
            'Check whether the child is currently enrolled in school and calculate the essential support needed for fees, books, and uniforms.',
          frontlineAction:
            'Record the current school grade, attendance status, and enter the needed financial support amounts across school fees, books, and uniforms.',
          smartBehavior:
            'Automatically calculates total annual education expenses and required support balances.',
          proTip:
            'If the family has recent school fee receipts or marks cards, take a quick photo of them using the document upload button.',
          imageSrc: '/images/guide/step-education.png',
          imageAlt: 'Education status and required support breakdown',
        },
        {
          id: '07',
          badge: 'Step 7 • Verification & Local Submission',
          title: 'Photograph Documents, Verify & Submit to Queue',
          summary:
            'Take clear photos of the bank passbook, child photo, and Aadhaar card. Confirm all entered details and save the record.',
          frontlineAction:
            'Take photos of the passbook front page and documents. Check "Yes — Verified", type your caseworker name, and tap "Submit Survey".',
          smartBehavior:
            'Masks Aadhaar numbers for privacy, saves the entire record securely into phone storage, and places it in the offline sync queue.',
          proTip:
            'A green banner confirms your survey is saved. You can immediately start your next household survey without waiting.',
          imageSrc: '/images/guide/step-review.png',
          imageAlt: 'Caseworker verification and local submission confirmation',
        },
      ],
    },
    {
      id: 'drafts' as GuideTrackId,
      tabLabel: 'Drafts & Autosave',
      shortLabel: 'Local Drafts',
      iconName: 'Bookmark',
      badge: 'Zero Data Loss',
      title: 'Managing Local In-Progress Drafts Without Internet',
      description:
        'How continuous automatic saving protects your work, how to pause when a mother is busy, resume in one tap, and clean up test entries.',
      quickBanner: {
        title: 'Continuous Background Saving on Your Device',
        description:
          'Home visits get interrupted all the time. Your answers are stored immediately inside your phone so you never have to retype.',
        tags: ['Saves on every keystroke', 'Safe to turn off phone', 'Resume from exact section', 'Local phone storage'],
      },
      steps: [
        {
          id: '01',
          badge: 'Step 1 • Automatic Saving',
          title: 'Every Keystroke Saved to Your Phone Instantly',
          summary:
            'You never need to look for a save button while filling out a form. Every letter you type and every choice you select is saved within a split second.',
          frontlineAction:
            'Fill in the questions naturally. Even if your phone runs out of battery or an incoming call interrupts you, nothing is lost.',
          smartBehavior:
            'Writes every change directly to internal IndexedDB storage inside your browser cache with zero lag.',
          proTip:
            'You can close your phone screen at any point during an interview without worrying about lost answers.',
          imageSrc: '/images/guide/step-dashboard.png',
          imageAlt: 'Automatic background saving on field workspace',
        },
        {
          id: '02',
          badge: 'Step 2 • Pausing in the Field',
          title: 'Pause the Visit When the Caregiver is Occupied',
          summary:
            'If a child is crying, asleep, or the mother needs to step away to prepare food, you can safely pause the interview.',
          frontlineAction:
            'Tap "Save Draft" at the top of the form, or simply exit the application. The survey remains safely saved on your device.',
          smartBehavior:
            'Bookmarks your exact location in the form and records the percentage completed so you can return directly.',
          proTip:
            'Let the mother know you will return after lunch; you will not need to repeat questions you already covered.',
          imageSrc: '/images/guide/step-consent.png',
          imageAlt: 'Pausing an active survey during field interview',
        },
        {
          id: '03',
          badge: 'Step 3 • Finding Drafts',
          title: 'All In-Progress Surveys Listed on the Home Screen',
          summary:
            'When you open the app, your saved drafts are neatly arranged right below the main survey button.',
          frontlineAction:
            'Open the app and scroll to "My In-Progress Drafts". Each card shows the child\'s name, intake code, and the last saved time.',
          smartBehavior:
            'Sorts drafts by the most recently updated, displaying progress bars and helpful reminders for unfinished visits.',
          proTip:
            'If you started a survey before asking for the child\'s name, it will show the intake code so you can still find it easily.',
          imageSrc: '/images/guide/step-drafts.png',
          imageAlt: 'My In-Progress Drafts card registry on home screen',
        },
        {
          id: '04',
          badge: 'Step 4 • Resuming Survey',
          title: '1-Tap "Resume Intake" to Pick Up Where You Left Off',
          summary:
            'Tap once to jump directly back into the survey with all previously entered measurements, photos, and signatures ready.',
          frontlineAction:
            'Tap "Resume Intake >" on the draft card. The form reopens at the exact section where you paused.',
          smartBehavior:
            'Re-populates all form inputs, GPS coordinates, and photos from phone memory in less than half a second.',
          proTip:
            'You can review and modify any previously answered questions before tapping the final submit button.',
          imageSrc: '/images/guide/step-drafts.png',
          imageAlt: 'Resuming a saved intake draft with one tap',
        },
        {
          id: '05',
          badge: 'Step 5 • Cleaning Up Drafts',
          title: 'Delete Accidental or Duplicate Test Drafts',
          summary:
            'Keep your phone storage neat by discarding test forms or accidental duplicate entries.',
          frontlineAction:
            'Tap the small red trash icon on any draft card you wish to remove. Confirm the prompt to delete it.',
          smartBehavior:
            'Permanently deletes the draft and associated photos from your phone memory, freeing up device storage.',
          proTip:
            'Only delete drafts that are genuine mistakes or practice entries, as deleted drafts cannot be restored.',
          imageSrc: '/images/guide/step-drafts.png',
          imageAlt: 'Deleting an unused draft to keep device storage clean',
        },
      ],
    },
    {
      id: 'editing' as GuideTrackId,
      tabLabel: 'Editing & Document Replacement',
      shortLabel: 'Edit & Replace',
      iconName: 'Edit3',
      badge: 'Quality Control & Revisions',
      title: 'How to Edit Submitted Surveys & Replace Incorrect Documents',
      description:
        'Clear instructions for correcting typos, replacing blurry bank passbook photos, uploading correct Aadhaar cards, and saving official revisions.',
      quickBanner: {
        title: 'Simple Document Replacement & Revision Tracking',
        description:
          'Uploaded a blurry passbook or typed a wrong digit? You can easily amend submitted records without losing previous history.',
        tags: ['Replace blurry photos in 1 tap', 'Update child measurements', 'Mandatory revision note', 'Automatic v1 to v2 increment'],
      },
      steps: [
        {
          id: '01',
          badge: 'Step 1 • When to Make an Edit',
          title: 'Common Field Reasons for Updating a Record',
          summary:
            'Field surveys move fast and adjustments are often needed: a passbook photo was blurred, an IFSC code changed, or a child\'s weight was miskeyed.',
          frontlineAction:
            'Review your submitted surveys. If a supervisor requests clearer documents or you noticed a mistake, open the amendment workflow.',
          smartBehavior:
            'Preserves the original survey submission while preparing an updated Revision 2 with an official audit trail.',
          proTip:
            'Check your passbook photo immediately after snapping it in the field to make sure the 11-digit IFSC is sharp and readable.',
          imageSrc: '/images/guide/step-submitted.png',
          imageAlt: 'Submitted surveys line-list with verification status',
        },
        {
          id: '02',
          badge: 'Step 2 • Finding the Record',
          title: 'Open "Submitted Surveys" from Top Navigation',
          summary:
            'All surveys you have completed—whether synced to the cloud or waiting in your phone queue—are listed in the Submitted Surveys registry.',
          frontlineAction:
            'Tap "Submitted Surveys" in the top navigation bar, or tap the "Waiting to be Sent" / "Synced" card on your home screen.',
          smartBehavior:
            'Shows a searchable line-list of all records with status badges, revision numbers, and quick action buttons.',
          proTip:
            'Use the search bar at the top to type the child\'s name or intake code to locate the record in seconds.',
          imageSrc: '/images/guide/step-submitted.png',
          imageAlt: 'Submitted surveys registry with search and filter controls',
        },
        {
          id: '03',
          badge: 'Step 3 • Opening the Editor',
          title: 'Tap "Edit" to Open the Amendment Screen',
          summary:
            'Open the full editing screen pre-filled with all the beneficiary\'s recorded details, measurements, and current documents.',
          frontlineAction:
            'On the child\'s survey card, tap "Edit" (or tap "View", review the summary modal, and tap "Edit Submission").',
          smartBehavior:
            'Loads the entire record into the editor, displays "Base Version: v1", and prepares "Submitting: Revision v2".',
          proTip:
            'The top banner clearly shows which revision you are working on so you always know your edit status.',
          imageSrc: '/images/guide/step-edit-replace.png',
          imageAlt: 'Edit record screen with revision tracker and note field',
        },
        {
          id: '04',
          badge: 'Step 4 • Replacing Documents',
          title: 'Tap "Replace Photo" on Passbook, Aadhaar, or Child Photo',
          summary:
            'Replacing an unreadable or incorrect document takes one tap without re-entering any other survey details.',
          frontlineAction:
            'Scroll to Section 3 (Banking & KYC Documents). On the document that needs correction, tap the "Replace Photo" button. Snap a sharp new photo in good light.',
          smartBehavior:
            'Instantly updates the document preview, safely replaces the cached image, and links the new file to the record.',
          proTip:
            'For bank passbooks, ensure the caregiver\'s name, account number, and bank branch IFSC are all within the photo frame.',
          imageSrc: '/images/guide/step-documents.png',
          imageAlt: 'Document photo upload card with replace photo button',
        },
        {
          id: '05',
          badge: 'Step 5 • Updating Information',
          title: 'Correct Child Details, Measurements & Bank Accounts',
          summary:
            'Modify any text field that needs correction, such as date of birth, caregiver contact number, or height and weight.',
          frontlineAction:
            'Click directly into the box you want to change. If you update height or weight, notice the nutrition score recalculates right away.',
          smartBehavior:
            'Validates telephone numbers and IFSC formats on the fly and re-scores nutritional classifications instantly.',
          proTip:
            'Always double-check that the bank account holder name matches the caregiver\'s name on the new passbook photo.',
          imageSrc: '/images/guide/step-clinical.png',
          imageAlt: 'Updating clinical nutrition measurements in edit screen',
        },
        {
          id: '06',
          badge: 'Step 6 • Saving Revision',
          title: 'Enter Reason for Amendment & Save Revision (v2)',
          summary:
            'Write a brief explanation for why the record was updated. This provides an honest audit trail for institutional reviewers.',
          frontlineAction:
            'In the "Reason for Amendment / Revision Note" box, type a short explanation (e.g. "Replaced blurry passbook photo with clear image showing legible IFSC"). Then tap "Save & Submit Revision".',
          smartBehavior:
            'Increases the revision counter (v1 to v2), saves the updated record, and queues the change for automatic supervisor sync.',
          proTip:
            'A clear revision note helps supervisors approve nutrition aid and educational support without sending the record back for questions.',
          imageSrc: '/images/guide/step-edit-replace.png',
          imageAlt: 'Entering reason for amendment and saving revision v2',
        },
      ],
    },
    {
      id: 'install' as GuideTrackId,
      tabLabel: 'Installation & Offline Setup',
      shortLabel: 'Install & Offline',
      iconName: 'Smartphone',
      badge: 'Device Setup & Airplane Mode',
      title: 'PWA Installation & Operating in Zero-Signal Villages',
      description:
        'How to install the application directly onto any Android phone or iPhone in 5 seconds without an app store account, and work completely offline.',
      quickBanner: {
        title: 'Zero Play Store Barrier • Installed in 5 Seconds',
        description:
          'Download directly from your browser. The app stores everything on your device so you can work deep in rural areas without signal.',
        tags: ['No Google account needed', 'No Apple ID required', '100% Airplane Mode ready', 'Auto background sync'],
      },
      steps: [
        {
          id: '01',
          badge: 'Step 1 • Android Installation',
          title: '1-Tap Installation on Any Android Smartphone',
          summary:
            'No Google Play Store account, password, or credit card required. Frontline staff can install the app on any budget Android phone in 5 seconds.',
          frontlineAction:
            'Tap "Install Application (PWA)" on this page. When your phone asks "Install app" or "Add to Home screen", tap "Install".',
          smartBehavior:
            'Downloads and caches the entire application shell and database locally so it opens like any native app on your phone.',
          proTip:
            'Once installed, the Alliance India icon appears right on your phone home screen next to your other daily apps.',
          imageSrc: '/images/guide/step-dashboard.png',
          imageAlt: 'Installed Alliance India icon on phone home screen',
        },
        {
          id: '02',
          badge: 'Step 2 • Apple iOS Setup',
          title: '3-Step Setup for iPhone & iPad (Safari)',
          summary:
            'Apple devices allow installing progressive web apps directly through the Safari Share menu without opening the App Store.',
          frontlineAction:
            'Open this page in Safari. Tap the Share button (square icon with an upward arrow), scroll down and tap "Add to Home Screen", then tap "Add".',
          smartBehavior:
            'Creates a standalone app on your iOS home screen that runs in full screen without browser toolbars.',
          proTip:
            'Always launch the app from your home screen icon for the best full-screen experience and reliable offline storage.',
          imageSrc: '/images/guide/step-dashboard.png',
          imageAlt: 'Safari Add to Home Screen instructions for iPhone and iPad',
        },
        {
          id: '03',
          badge: 'Step 3 • Offline Field Work',
          title: 'Operating 100% Offline in Remote Villages',
          summary:
            'Conduct complete household surveys in rural tribal blocks with zero cellular signal or internet connectivity.',
          frontlineAction:
            'Open the app from your home screen. Turn on Airplane Mode to save phone battery during long village visits. Fill forms normally.',
          smartBehavior:
            'Stores all text responses, measurements, audio consent, signatures, and photos securely in your phone storage.',
          proTip:
            'Airplane Mode keeps your phone cool and saves significant battery life since the phone does not waste energy searching for cell towers.',
          imageSrc: '/images/guide/step-clinical.png',
          imageAlt: 'Working 100% offline with amber offline mode indicator',
        },
        {
          id: '04',
          badge: 'Step 4 • Automatic Cloud Sync',
          title: 'Automatic Upload When You Return to Connectivity',
          summary:
            'When you return from the field to an area with mobile network or Wi-Fi, your completed surveys upload automatically.',
          frontlineAction:
            'Check the "Waiting to be Sent" counter on your home screen. When you connect to the internet, pending records upload in the background.',
          smartBehavior:
            'Uploads records safely using unique cryptographic IDs and deduplication so records are never uploaded twice.',
          proTip:
            'Tap "Submitted Surveys" to review verified upload timestamps, receipt IDs, and supervisor status.',
          imageSrc: '/images/guide/step-submitted.png',
          imageAlt: 'Automatic background upload and sync verification',
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

  const renderTrackIcon = (trackId: GuideTrackId, className: string = 'w-4 h-4') => {
    switch (trackId) {
      case 'lifecycle':
        return <FileText className={className} />;
      case 'drafts':
        return <Bookmark className={className} />;
      case 'editing':
        return <Edit3 className={className} />;
      case 'install':
        return <Smartphone className={className} />;
      default:
        return <FileText className={className} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col selection:bg-teal-500 selection:text-white font-sans antialiased">
      {/* ── Top Institutional Header ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
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

          {/* Nav Links */}
          <nav className="hidden md:flex items-center space-x-6 text-xs font-semibold text-slate-600">
            <a href="#operational-guide" className="hover:text-teal-700 transition-colors">
              Operational Guide
            </a>
            <a href="#core-capabilities" className="hover:text-teal-700 transition-colors">
              Capabilities
            </a>
            <a href="#field-faq" className="hover:text-teal-700 transition-colors">
              Field FAQ
            </a>
          </nav>

          {/* Primary Action CTA - Download Only */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleDownloadClick}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 active:scale-[0.98] shadow-xs hover:shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isStandalone ? 'App Installed' : 'Download App (PWA)'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Standalone Mode Banner if already opened in installed app ── */}
      {isStandalone && (
        <div className="bg-teal-50 border-b border-teal-200 px-4 py-2 text-center text-xs font-medium text-teal-900 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
          <span>You are running the installed Alliance PWA.</span>
          <Link href="/app" className="font-bold underline ml-1 hover:text-teal-950">
            Enter Field Workspace &rarr;
          </Link>
        </div>
      )}

      {/* ── Hero Section (High-Craft Institutional Design) ── */}
      <section className="relative pt-12 sm:pt-20 pb-16 sm:pb-24 overflow-hidden border-b border-slate-200/80 bg-gradient-to-b from-white via-slate-50/80 to-slate-100/50">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-b from-teal-100/30 via-emerald-50/20 to-transparent blur-3xl pointer-events-none -z-10" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          {/* Institutional Status Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200/80 text-teal-900 text-xs font-semibold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
            <span>Institutional Field Health Platform &bull; India HIV/AIDS Alliance</span>
          </div>

          {/* Outcome-Led Title */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.18] max-w-4xl mx-auto">
            Community Child Nutrition Assessments,{' '}
            <span className="text-teal-700">
              Built for the Field.
            </span>
          </h1>

          {/* Jargon-Free Human Narrative */}
          <p className="text-sm sm:text-base md:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
            A reliable, zero-data-loss application engineered for ASHAs, Anganwadi workers, and coordinators to assess child nutrition, record clinical growth metrics, and verify household support — completely offline.
          </p>

          {/* Primary Action Button - Download Only */}
          <div className="pt-2 flex items-center justify-center">
            <button
              type="button"
              onClick={handleDownloadClick}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-sm font-bold text-white bg-teal-700 hover:bg-teal-800 active:scale-[0.99] shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download &amp; Install PWA</span>
              <span className="text-[10px] bg-teal-800/80 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                Free &bull; 0 MB
              </span>
            </button>
          </div>

          {/* Value Micro-Pills */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200/90 shadow-2xs">
              <WifiOff className="w-3.5 h-3.5 text-teal-700" />
              100% Airplane Mode Ready
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200/90 shadow-2xs">
              <MapPin className="w-3.5 h-3.5 text-teal-700" />
              Sub-10m Landmark Fix
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200/90 shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              Encrypted Local Storage
            </span>
          </div>

          {/* ── Authentic Hero Product Preview Mockup ── */}
          <div className="pt-8 sm:pt-12 max-w-4xl mx-auto">
            <div className="relative rounded-2xl sm:rounded-3xl p-2 sm:p-3 bg-slate-200/70 border border-slate-300/80 shadow-xl">
              <div className="bg-white rounded-xl sm:rounded-2xl overflow-hidden border border-slate-200/90 relative">
                {/* Simulated Device / Browser Masthead */}
                <div className="bg-slate-100/90 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  </div>
                  <div className="bg-white px-3 py-0.5 rounded-md border border-slate-200 text-[10.5px] font-mono text-slate-500 flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span>app.allianceindia.org</span>
                  </div>
                  <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 border border-teal-200/70 px-2 py-0.5 rounded-full">
                    Installed PWA Workspace
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
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-transparent to-transparent flex items-end p-4 sm:p-6">
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

      {/* ── Frontline Field Staff Operational Guide ── */}
      <section id="operational-guide" className="py-16 sm:py-24 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold uppercase tracking-wider">
              Field Staff Operational Handbook
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Systematic Field Operations &amp; Form Guide
            </h2>
            <p className="text-sm sm:text-base text-slate-600 font-normal">
              Clear, step-by-step guidance covering household visits, managing offline drafts, and editing submitted records with document replacement.
            </p>
          </div>

          {/* ── 4 Interactive Operational Tracks Navigation Tabs ── */}
          <div className="flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-2 scroll-smooth no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden border-b border-slate-200">
            {guideTracks.map((track) => {
              const isSelected = activeTrackId === track.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => handleTabChange(track.id)}
                  className={`px-4 py-3 rounded-t-xl text-xs sm:text-sm font-bold shrink-0 transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
                    isSelected
                      ? 'border-teal-700 text-teal-900 bg-teal-50/70 shadow-2xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {renderTrackIcon(track.id, `w-4 h-4 shrink-0 ${isSelected ? 'text-teal-700' : 'text-slate-500'}`)}
                  <span>{track.tabLabel}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      isSelected
                        ? 'bg-teal-200/60 text-teal-900'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {track.steps.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Active Track Context Banner ── */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-[11px] font-semibold">
                {currentTrack.badge}
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white">{currentTrack.title}</h3>
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
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-[11px] font-medium text-teal-200 border border-white/10"
                  >
                    <Check className="w-3 h-3 text-teal-400" />
                    <span>{tag}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Dedicated Visual Scenario Callout for Document Replacement ── */}
          {activeTrackId === 'editing' && (
            <div className="p-5 sm:p-6 rounded-2xl bg-amber-50/80 border border-amber-200/80 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                <History className="w-4 h-4 text-amber-700" />
                <span>Operational Flow: Replacing an Incorrect or Blurry Document</span>
              </div>
              <p className="text-xs text-amber-950 leading-relaxed font-normal">
                If an Anganwadi worker or field coordinator accidentally uploaded a blurry bank passbook or wrong Aadhaar card during intake:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                <div className="bg-white p-3.5 rounded-xl border border-amber-200/80 text-xs space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-800 font-mono text-[10px]">STEP 1</span>
                    <History className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <p className="font-bold text-slate-900">Open Submitted Surveys</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">Tap &quot;Submitted Surveys&quot; in the top navigation to locate the child&apos;s record.</p>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-amber-200/80 text-xs space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-800 font-mono text-[10px]">STEP 2</span>
                    <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <p className="font-bold text-slate-900">Tap &quot;Edit&quot;</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">Opens the complete 9-section amendment workspace preloaded with current data.</p>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-amber-200/80 text-xs space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-800 font-mono text-[10px]">STEP 3</span>
                    <Camera className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <p className="font-bold text-slate-900">Tap &quot;Replace Photo&quot;</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">Capture a sharp camera photo showing clear bank IFSC &amp; account number.</p>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-amber-200/80 text-xs space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-800 font-mono text-[10px]">STEP 4</span>
                    <UploadCloud className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <p className="font-bold text-slate-900">Save Revision (v2)</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">Enter a brief audit note and tap &quot;Save &amp; Submit Revision&quot; to queue for sync.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Interactive Step Selector Pills with Smooth Scroll Buttons ── */}
          <div className="relative flex items-center gap-2 w-full">
            {/* Scroll Left Button */}
            <button
              type="button"
              onClick={() => scrollSteps('left')}
              aria-label="Scroll steps left"
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-white border border-slate-200 text-slate-700 hover:text-teal-800 hover:bg-teal-50 hover:border-teal-300 shadow-2xs transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Scrollable Steps Track */}
            <div
              ref={stepScrollRef}
              className="flex-1 flex items-center justify-start sm:justify-center gap-2 overflow-x-auto py-1 scroll-smooth no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {currentTrack.steps.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveStepIndex(idx)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeStepIndex === idx
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span className="opacity-75 font-mono text-[10px]">#{s.id}</span>
                  <span>{s.badge.split('•')[1]?.trim() || s.badge}</span>
                </button>
              ))}
            </div>

            {/* Scroll Right Button */}
            <button
              type="button"
              onClick={() => scrollSteps('right')}
              aria-label="Scroll steps right"
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-white border border-slate-200 text-slate-700 hover:text-teal-800 hover:bg-teal-50 hover:border-teal-300 shadow-2xs transition-all cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* ── Active Step Deep Dive Card ── */}
          {currentStep && (
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 lg:p-10 shadow-xs grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Column: Clear Step Instructions */}
              <div className="lg:col-span-6 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-50 border border-teal-200/80 text-teal-900 text-xs font-bold font-mono">
                  {currentStep.badge}
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
                  {currentStep.title}
                </h3>

                <p className="text-sm text-slate-600 leading-relaxed font-normal">
                  {currentStep.summary}
                </p>

                {/* Frontline Action Card */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                    <span className="text-[11px] font-bold text-teal-900 uppercase tracking-wider">
                      Action in the field:
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {currentStep.frontlineAction}
                  </p>
                </div>

                {/* Smart PWA Behavior Card */}
                <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-200/60 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-teal-800 shrink-0" />
                    <span className="text-[11px] font-bold text-teal-900 uppercase tracking-wider">
                      Automatic system response:
                    </span>
                  </div>
                  <p className="text-xs text-teal-950 leading-relaxed">
                    {currentStep.smartBehavior}
                  </p>
                </div>

                {/* Practical Field Tip */}
                <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/70 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                      Practical field tip:
                    </span>
                  </div>
                  <p className="text-xs text-amber-950 leading-relaxed">
                    {currentStep.proTip}
                  </p>
                </div>
              </div>

              {/* Right Column: Visual Screenshot & Step Walkthrough */}
              <div className="lg:col-span-6 space-y-4">
                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-slate-300/80 shadow-md bg-slate-900">
                  {/* Subtle top device status bar */}
                  <div className="bg-slate-800/90 px-4 py-2 flex items-center justify-between border-b border-slate-700 text-[10.5px] text-slate-300 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-teal-400" />
                      <span>Screen Verification: {currentStep.id}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">Field Screen</span>
                  </div>
                  <div className="relative w-full h-[calc(100%-33px)] bg-slate-100">
                    <Image
                      src={currentStep.imageSrc}
                      alt={currentStep.imageAlt}
                      fill
                      className="object-contain p-2"
                    />
                  </div>
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
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer transition-colors shadow-2xs"
                  >
                    &larr; Previous Step
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
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 cursor-pointer transition-colors shadow-2xs"
                  >
                    Next Step &rarr;
                  </button>
                </div>
              </div>
            </div>
          )}
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
                <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
              </summary>
              <p className="pt-2 leading-relaxed text-slate-600 font-normal">
                No. You only need internet for a few seconds once to download the app. After that, you can conduct all surveys in 100% offline mode or Airplane mode. Your data is stored safely in your phone and syncs automatically when you return to coverage.
              </p>
            </details>

            <details className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 group cursor-pointer">
              <summary className="font-bold text-slate-900 text-sm list-none flex items-center justify-between">
                <span>How do I replace a blurry document or incorrect photo after submitting?</span>
                <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
              </summary>
              <p className="pt-2 leading-relaxed text-slate-600 font-normal">
                Go to &ldquo;Submitted Surveys&rdquo; in the top navigation, locate the child&apos;s record, and tap &ldquo;Edit&rdquo;. Scroll down to Section 3 (Banking &amp; KYC Documents) and tap &ldquo;Replace Photo&rdquo; on the blurry document. Snap a new, clear photo in good lighting, enter a brief amendment note at the top, and tap &ldquo;Save &amp; Submit Revision&rdquo;. The system increments the version (v2) and queues the updated file for cloud sync.
              </p>
            </details>

            <details className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 group cursor-pointer">
              <summary className="font-bold text-slate-900 text-sm list-none flex items-center justify-between">
                <span>What should I do if the GPS button shows &ldquo;GPS position unavailable&rdquo;?</span>
                <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
              </summary>
              <p className="pt-2 leading-relaxed text-slate-600 font-normal">
                1. Make sure your phone&apos;s &ldquo;Location / GPS&rdquo; toggle is turned ON in settings.<br />
                2. If you are inside a concrete or tin-roofed house, take two steps outside onto the porch to allow satellites to connect directly.<br />
                3. You can also manually type or edit the colony and landmark names in the address box.
              </p>
            </details>

            <details className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 group cursor-pointer">
              <summary className="font-bold text-slate-900 text-sm list-none flex items-center justify-between">
                <span>What happens if my phone battery dies in the middle of a survey?</span>
                <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
              </summary>
              <p className="pt-2 leading-relaxed text-slate-600 font-normal">
                Nothing is lost. The PWA automatically saves each field the moment you enter it. When you recharge your phone and open the app, your survey will be waiting under &ldquo;My In-Progress Drafts&rdquo; with the exact step where you left off.
              </p>
            </details>

            <details className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 group cursor-pointer">
              <summary className="font-bold text-slate-900 text-sm list-none flex items-center justify-between">
                <span>Can multiple field workers share the same smartphone?</span>
                <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
              </summary>
              <p className="pt-2 leading-relaxed text-slate-600 font-normal">
                Yes. Each draft is tagged with a unique intake code (e.g. DL-SOU-091639-01). Different surveyors can complete different drafts on the same device without overlapping.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* ── Bottom Call to Action Section ── */}
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
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 transition-all cursor-pointer shadow-md"
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
            <span>&bull;</span>
            <span>Child Nutrition &amp; Support Platform</span>
          </div>
          <div className="flex items-center space-x-4 text-[11px]">
            <span>Version 3.0.0 (Phase 3 Production)</span>
            <span>&bull;</span>
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
                <Smartphone className="w-5 h-5 text-teal-700" />
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
        <div className="fixed bottom-6 right-6 z-50 bg-teal-800 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom duration-300">
          <Check className="w-5 h-5 text-teal-300" />
          <div>
            <p className="text-xs font-bold">App Installed Successfully!</p>
            <p className="text-[11px] text-teal-100">Launching field workspace&hellip;</p>
          </div>
        </div>
      )}
    </div>
  );
}
