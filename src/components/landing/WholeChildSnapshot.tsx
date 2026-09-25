'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Apple, GraduationCap, Users2, HeartHandshake, Check, Sparkles } from 'lucide-react';

export function WholeChildSnapshot() {
  const sectionRef = useRef<HTMLElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (sectionRef.current) {
            const rect = sectionRef.current.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            const totalDist = rect.height + windowHeight;
            const currentDist = windowHeight - rect.top;
            const progress = Math.min(Math.max(currentDist / totalDist, 0), 1);
            setScrollProgress(progress);
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section ref={sectionRef} id="whole-child" aria-labelledby="snapshot-heading" className="relative overflow-hidden">
      {/* ── Section Header (on light warm paper) ── */}
      <div className="py-12 sm:py-16 bg-[#F7F3E9] border-b border-[#E4D8C7]/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-bold font-mono tracking-widest uppercase bg-[#EDE3D2] text-[#63513D] border border-[#D5C2AA] mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-800" />
              Chapter II • The Illustrated Field Storybook
            </div>
            <h2
              id="snapshot-heading"
              className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight"
            >
              Why it matters: a whole-child snapshot.
            </h2>
            <p className="mt-3 text-base sm:text-lg text-slate-700 font-medium leading-relaxed">
              Children are not isolated clinical metrics. Frontline caseworkers assemble the complete picture of health,
              schooling, and family stability so programs can coordinate actionable support with dignity.
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          STATION 1: NUTRITION & WELLBEING (Terracotta Earth Horizon)
      ══════════════════════════════════════════════════════════════════ */}
      {/* Horizon 1 Transition: Torn Paper & Gentle Hills from Sky to Terracotta */}
      <div className="w-full overflow-hidden leading-none relative z-10 -mb-1 bg-[#F7F3E9]">
        <svg
          className="relative block w-full h-12 sm:h-20 text-[#B8553A]"
          viewBox="0 0 1440 90"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          {/* Layer 1: Soft clay hillside */}
          <path
            d="M0,45 Q360,10 720,40 T1440,25 L1440,90 L0,90 Z"
            fill="#D97A5E"
            fillOpacity="0.45"
          />
          {/* Layer 2: Torn edge silhouette */}
          <path
            d="M0,58 L40,54 L90,62 L150,56 L210,65 L280,59 L350,67 L420,58 L490,64 L560,57 L630,66 L700,59 L770,68 L840,58 L910,65 L980,57 L1050,66 L1120,58 L1190,65 L1260,57 L1330,64 L1400,56 L1440,62 L1440,90 L0,90 Z"
            fill="#B8553A"
          />
        </svg>
      </div>

      <div className="bg-[#B8553A] text-white py-12 sm:py-20 relative">
        {/* Subtle watercolor paper grain pattern */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Illustrated Artwork: Caseworker, Child, Measuring Pole & Nutrition Basket */}
            <div className="lg:col-span-6 flex justify-center order-2 lg:order-1">
              <div className="relative w-full max-w-[440px] rounded-3xl p-4 sm:p-6 bg-white/10 backdrop-blur-xs border border-white/20 shadow-xl overflow-hidden">
                {/* Continuous Dotted Journey Trail */}
                <div className="absolute top-4 left-6 text-white/60 font-mono text-[11px] font-bold tracking-widest uppercase flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-300 animate-pulse" />
                  Station 01 • Nutrition &amp; Physical Growth
                </div>

                <svg
                  viewBox="0 0 400 280"
                  className="w-full h-auto mt-6"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  {/* Gentle warm pulsing & floating sun */}
                  <g className="motion-safe:animate-sun-pulse origin-center">
                    <circle cx="340" cy="50" r="32" fill="#FDE047" fillOpacity="0.8" />
                    <circle cx="340" cy="50" r="42" fill="#FEF08A" fillOpacity="0.3" />
                  </g>

                  {/* Ambient drifting cloud */}
                  <g className="motion-safe:animate-cloud-drift opacity-75">
                    <ellipse cx="270" cy="45" rx="20" ry="8" fill="#FFFFFF" fillOpacity="0.5" />
                    <ellipse cx="285" cy="42" rx="14" ry="10" fill="#FFFFFF" fillOpacity="0.6" />
                  </g>

                  {/* Undulating Ground Mound */}
                  <path d="M-20,260 Q120,210 260,240 T420,230 L420,300 L-20,300 Z" fill="#9C442D" />

                  {/* Measuring Stadiometer Pole with height marks */}
                  <rect x="80" y="40" width="16" height="210" rx="3" fill="#F4EFE6" stroke="#D1C4B2" strokeWidth="2" />
                  {/* Metric calibrations */}
                  {[60, 80, 100, 120, 140, 160, 180, 200, 220].map((y) => (
                    <line key={y} x1="86" y1={y} x2="94" y2={y} stroke="#78350F" strokeWidth="1.5" />
                  ))}
                  {/* WHO Green safe growth headboard */}
                  <rect x="68" y="90" width="40" height="12" rx="3" fill="#15803D" />
                  <polygon points="108,96 116,92 116,100" fill="#15803D" />
                  <text x="73" y="99" fill="#FFFFFF" fontSize="8" fontWeight="bold" fontFamily="monospace">WHO ✓</text>

                  {/* Illustrated Child Character (Hand-drawn style) */}
                  <g className="motion-safe:animate-[bounce_4s_ease-in-out_infinite]">
                    {/* Head */}
                    <circle cx="150" cy="115" r="22" fill="#E8B48B" />
                    {/* Hair */}
                    <path d="M130,110 Q145,90 170,105 Q172,95 160,92 Q140,90 130,110 Z" fill="#292524" />
                    {/* Cheerful face */}
                    <circle cx="144" cy="116" r="2.5" fill="#292524" />
                    <circle cx="156" cy="116" r="2.5" fill="#292524" />
                    <path d="M145,123 Q150,128 155,123" stroke="#9A3412" strokeWidth="2" strokeLinecap="round" fill="none" />
                    {/* T-Shirt */}
                    <path d="M132,137 L168,137 L174,185 L126,185 Z" fill="#38BDF8" rx="4" />
                    {/* Shorts */}
                    <rect x="130" y="185" width="40" height="28" rx="4" fill="#0369A1" />
                    {/* Legs */}
                    <rect x="135" y="213" width="10" height="35" rx="3" fill="#E8B48B" />
                    <rect x="155" y="213" width="10" height="35" rx="3" fill="#E8B48B" />
                    {/* Shoes */}
                    <ellipse cx="140" cy="250" rx="8" ry="4" fill="#1E293B" />
                    <ellipse cx="160" cy="250" rx="8" ry="4" fill="#1E293B" />
                    {/* Arm stretching up to headboard */}
                    <path d="M164,142 Q178,120 176,96" stroke="#E8B48B" strokeWidth="6" strokeLinecap="round" fill="none" />
                    <circle cx="176" cy="94" r="4" fill="#E8B48B" />
                  </g>

                  {/* Illustrated Caseworker (Supportive Presence) */}
                  <g>
                    {/* Caseworker Head */}
                    <circle cx="230" cy="85" r="24" fill="#D49A70" />
                    {/* Hair */}
                    <path d="M210,80 Q230,55 252,75 Q254,65 240,60 Q220,60 210,80 Z" fill="#1C1917" />
                    {/* Gentle smile */}
                    <circle cx="224" cy="86" r="2.5" fill="#1C1917" />
                    <circle cx="236" cy="86" r="2.5" fill="#1C1917" />
                    <path d="M225,93 Q230,97 235,93" stroke="#7C2D12" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                    {/* Kurta / Tunic */}
                    <path d="M210,110 L250,110 L258,195 L202,195 Z" fill="#047857" rx="5" />
                    {/* ID Badge Lanyard */}
                    <path d="M222,110 L230,140 L238,110" stroke="#FEF08A" strokeWidth="2" fill="none" />
                    <rect x="225" y="140" width="10" height="14" rx="2" fill="#FFFFFF" stroke="#D1D5DB" />
                    {/* Caseworker Holding Clipboard */}
                    <rect x="250" y="125" width="28" height="38" rx="3" fill="#D97706" transform="rotate(10 250 125)" />
                    <rect x="254" y="130" width="20" height="28" rx="2" fill="#FFFBEB" transform="rotate(10 250 125)" />
                    {/* Legs */}
                    <rect x="214" y="195" width="12" height="52" rx="3" fill="#F8FAFC" />
                    <rect x="234" y="195" width="12" height="52" rx="3" fill="#F8FAFC" />
                    <ellipse cx="220" cy="250" rx="9" ry="4" fill="#334155" />
                    <ellipse cx="240" cy="250" rx="9" ry="4" fill="#334155" />
                  </g>

                  {/* Nutrition Basket in Foreground (Papaya, Banana, Dal bowl) with gentle float */}
                  <g transform="translate(290, 190)" className="motion-safe:animate-float-slow origin-bottom">
                    {/* Woven Basket Base */}
                    <ellipse cx="40" cy="40" rx="36" ry="16" fill="#78350F" />
                    <path d="M6,40 Q40,75 74,40 Z" fill="#92400E" />
                    {/* Yellow Papaya */}
                    <path d="M22,35 C20,20 35,10 40,24 C45,36 30,42 22,35 Z" fill="#F59E0B" />
                    {/* Green Bananas */}
                    <path d="M35,28 Q50,15 62,30" stroke="#84CC16" strokeWidth="6" strokeLinecap="round" fill="none" />
                    <path d="M32,34 Q48,22 58,36" stroke="#65A30D" strokeWidth="5.5" strokeLinecap="round" fill="none" />
                    {/* Traditional Brass Dal / Lentil Bowl */}
                    <ellipse cx="14" cy="46" rx="14" ry="7" fill="#B45309" stroke="#FDE68A" strokeWidth="1.5" />
                    <ellipse cx="14" cy="45" rx="11" ry="5" fill="#D97706" />
                  </g>

                  {/* Continuous Journey Dotted Connector Path - Scroll Animated */}
                  <path
                    d="M30,220 Q120,250 200,230 T380,260"
                    stroke="#FEF3C7"
                    strokeWidth="3"
                    strokeDasharray="10 6"
                    strokeDashoffset={350 * (1 - Math.min(scrollProgress * 3, 1))}
                    fill="none"
                    className="support-path-draw transition-[stroke-dashoffset] duration-150 ease-out"
                  />
                </svg>
              </div>
            </div>

            {/* Pinned Case Slip: Nutrition & Health */}
            <div className="lg:col-span-6 order-1 lg:order-2">
              <div className="relative p-6 sm:p-8 rounded-2xl bg-[#FCFAF6] text-slate-900 border border-[#D5C2AA] shadow-xl notebook-paper-sheet">
                {/* Silver Paperclip SVG pinning the card */}
                <div className="absolute -top-3.5 right-8 w-6 h-12 z-20 pointer-events-none" aria-hidden="true">
                  <svg viewBox="0 0 24 48" fill="none" className="w-full h-full drop-shadow-md">
                    <path
                      d="M8,12 L8,36 C8,41 16,41 16,36 L16,8 C16,3 4,3 4,8 L4,38 C4,45 20,45 20,38 L20,12"
                      stroke="#94A3B8"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    Section 4 &amp; 5 • Physical Wellbeing
                  </span>
                  <div className="text-[11px] font-mono font-bold text-slate-500">
                    STATION // 01
                  </div>
                </div>

                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
                  Nutrition &amp; Health
                </h3>

                <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-normal mb-6">
                  Standardized anthropometry (height, weight, MUAC), appetite observations, and meal frequency to monitor developmental growth without intimidating families.
                </p>

                <div className="pt-4 border-t border-[#E8DFD1]">
                  <h4 className="text-[11px] font-mono font-bold uppercase text-slate-500 mb-3 tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-700" />
                    Key Observables
                  </h4>
                  <ul className="space-y-2.5 text-xs sm:text-sm font-medium text-slate-800">
                    {['WHO Z-Score categorization', 'Non-judgmental eating habits', 'Regular clinical monitoring'].map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <span className="w-4 h-4 rounded-xs border border-emerald-700/60 bg-emerald-50 text-emerald-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          ✓
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          STATION 2: EDUCATION CONTINUITY (Lush Meadow Green Horizon)
      ══════════════════════════════════════════════════════════════════ */}
      {/* Horizon 2 Transition: Undulating Layered Meadow Hills from Terracotta to Green */}
      <div className="w-full overflow-hidden leading-none relative z-10 -mb-1 bg-[#B8553A]">
        <svg
          className="relative block w-full h-14 sm:h-24 text-[#235339]"
          viewBox="0 0 1440 90"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          {/* Layer 1: Soft sage rolling hill */}
          <path
            d="M0,35 Q400,65 800,25 T1440,40 L1440,90 L0,90 Z"
            fill="#528A6B"
            fillOpacity="0.5"
          />
          {/* Layer 2: Main meadow hill silhouette */}
          <path
            d="M0,52 Q320,15 720,48 T1440,32 L1440,90 L0,90 Z"
            fill="#235339"
          />
        </svg>
      </div>

      <div className="bg-[#235339] text-white py-12 sm:py-20 relative">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#80E5A3_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Pinned Schooling Grant Ledger Slip */}
            <div className="lg:col-span-6 order-1">
              <div className="relative p-6 sm:p-8 rounded-2xl bg-[#FCFAF6] text-slate-900 border border-[#D5C2AA] shadow-xl notebook-paper-sheet">
                {/* Official Circular Stamp: DISTRICT AID MATCHED */}
                <div className="absolute -top-3.5 right-8 px-3 py-1 rounded-md notebook-stamp text-[10px] font-bold">
                  ★ DISTRICT AID MATCHED ★
                </div>

                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-sky-100 text-sky-900 border border-sky-300">
                    Section 6 &amp; 7 • Schooling Grants
                  </span>
                  <div className="text-[11px] font-mono font-bold text-slate-500">
                    STATION // 02
                  </div>
                </div>

                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
                  Education Continuity
                </h3>

                <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-normal mb-6">
                  Tracking school enrollment, attendance consistency, India-aligned class standards (Pre-Nursery to Class 12+), and itemized educational expense requirements.
                </p>

                <div className="pt-4 border-t border-[#E8DFD1]">
                  <h4 className="text-[11px] font-mono font-bold uppercase text-slate-500 mb-3 tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-700" />
                    Key Observables
                  </h4>
                  <ul className="space-y-2.5 text-xs sm:text-sm font-medium text-slate-800">
                    {['Standardized Indian grade levels', 'Cost matching & fee receipts', 'Retention & attendance support'].map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <span className="w-4 h-4 rounded-xs border border-emerald-700/60 bg-emerald-50 text-emerald-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          ✓
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Illustrated Artwork: Stepping Stones (Class 1–12+), School Satchel, Soaring Kite */}
            <div className="lg:col-span-6 flex justify-center order-2">
              <div className="relative w-full max-w-[440px] rounded-3xl p-4 sm:p-6 bg-white/10 backdrop-blur-xs border border-white/20 shadow-xl overflow-hidden">
                <div className="absolute top-4 left-6 text-emerald-200 font-mono text-[11px] font-bold tracking-widest uppercase flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse" />
                  Station 02 • Education Pathway
                </div>

                <svg
                  viewBox="0 0 400 280"
                  className="w-full h-auto mt-6"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  {/* Gentle Rolling Grassy Hill */}
                  <path d="M-10,240 Q150,150 410,210 L410,300 L-10,300 Z" fill="#1B422D" />

                  {/* Stepping Stones Winding Upward: Pre-Nursery to Class 12+ */}
                  <g>
                    {/* Stone 1: Pre-Nursery */}
                    <ellipse cx="60" cy="235" rx="30" ry="12" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="2" />
                    <text x="38" y="238" fill="#334155" fontSize="7.5" fontWeight="bold" fontFamily="monospace">Pre-Nur</text>

                    {/* Stone 2: Class 1-5 */}
                    <ellipse cx="130" cy="205" rx="32" ry="13" fill="#FEF08A" stroke="#FDE047" strokeWidth="2" />
                    <text x="108" y="208" fill="#713F12" fontSize="7.5" fontWeight="bold" fontFamily="monospace">Class 1–5</text>

                    {/* Stone 3: Class 6-8 */}
                    <ellipse cx="205" cy="180" rx="32" ry="13" fill="#BAE6FD" stroke="#7DD3FC" strokeWidth="2" />
                    <text x="183" y="183" fill="#0C4A6E" fontSize="7.5" fontWeight="bold" fontFamily="monospace">Class 6–8</text>

                    {/* Stone 4: Class 9-10 */}
                    <ellipse cx="275" cy="155" rx="34" ry="14" fill="#BBF7D0" stroke="#86EFAC" strokeWidth="2" />
                    <text x="250" y="158" fill="#14532D" fontSize="7.5" fontWeight="bold" fontFamily="monospace">Class 9–10</text>

                    {/* Stone 5: Class 12+ */}
                    <ellipse cx="340" cy="130" rx="36" ry="14" fill="#FED7AA" stroke="#FDBA74" strokeWidth="2" />
                    <text x="312" y="133" fill="#7C2D12" fontSize="8" fontWeight="extrabold" fontFamily="monospace">Class 12+ ★</text>
                  </g>

                  {/* School Satchel / Backpack on Grass with subtle breathing float */}
                  <g transform="translate(45, 130)" className="motion-safe:animate-float origin-bottom">
                    {/* Bag body */}
                    <rect x="0" y="10" width="45" height="48" rx="8" fill="#DC2626" stroke="#991B1B" strokeWidth="1.5" />
                    {/* Flap */}
                    <path d="M0,25 Q22,38 45,25 L45,10 L0,10 Z" fill="#B91C1C" />
                    {/* Pocket */}
                    <rect x="8" y="32" width="29" height="18" rx="4" fill="#EF4444" />
                    {/* Buckle */}
                    <rect x="19" y="28" width="7" height="8" rx="2" fill="#FEF08A" />
                    {/* Books & Ruler sticking out */}
                    <rect x="8" y="0" width="10" height="14" rx="2" fill="#3B82F6" />
                    <rect x="22" y="4" width="8" height="10" rx="1" fill="#F59E0B" />
                    <rect x="32" y="-2" width="4" height="16" rx="1" fill="#10B981" />
                  </g>

                  {/* Flying Saffron & Teal Kite Soaring into the Sky */}
                  <g className="motion-safe:animate-kite-soar origin-center" transform="translate(230, 20)">
                    {/* Diamond Kite Body */}
                    <polygon points="40,0 80,40 40,80 0,40" fill="#F97316" stroke="#EA580C" strokeWidth="1.5" />
                    <polygon points="40,0 40,80 0,40" fill="#0D9488" />
                    {/* Cross spars */}
                    <line x1="40" y1="0" x2="40" y2="80" stroke="#FFFFFF" strokeWidth="1.5" />
                    <line x1="0" y1="40" x2="80" y2="40" stroke="#FFFFFF" strokeWidth="1.5" />
                    {/* Kite Tail Ribbons */}
                    <path d="M40,80 Q30,105 45,120 T35,145 T50,170" stroke="#FEF08A" strokeWidth="2" fill="none" />
                    <polygon points="40,100 34,95 34,105" fill="#EF4444" />
                    <polygon points="44,125 50,120 50,130" fill="#3B82F6" />
                    <polygon points="38,150 32,145 32,155" fill="#10B981" />
                  </g>

                  {/* Connecting Dotted Trail - Scroll Animated */}
                  <path
                    d="M10,250 Q120,240 200,210 T380,170"
                    stroke="#86EFAC"
                    strokeWidth="2.5"
                    strokeDasharray="10 6"
                    strokeDashoffset={350 * (1 - Math.min(Math.max((scrollProgress - 0.2) * 3, 0), 1))}
                    fill="none"
                    className="support-path-draw transition-[stroke-dashoffset] duration-150 ease-out"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          STATION 3: FAMILY CARE & OFFLINE SYNC (Sunny Marigold Horizon)
      ══════════════════════════════════════════════════════════════════ */}
      {/* Horizon 3 Transition: Rolling Ridge from Meadow Green to Marigold */}
      <div className="w-full overflow-hidden leading-none relative z-10 -mb-1 bg-[#235339]">
        <svg
          className="relative block w-full h-14 sm:h-24 text-[#C67E20]"
          viewBox="0 0 1440 90"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          {/* Layer 1: Golden sunset slope */}
          <path
            d="M0,40 Q420,70 840,20 T1440,35 L1440,90 L0,90 Z"
            fill="#E09B36"
            fillOpacity="0.45"
          />
          {/* Layer 2: Main marigold horizon */}
          <path
            d="M0,55 Q360,20 720,50 T1440,30 L1440,90 L0,90 Z"
            fill="#C67E20"
          />
        </svg>
      </div>

      <div className="bg-[#C67E20] text-white py-12 sm:py-20 relative">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Illustrated Artwork: Village Home, Protective Shield & Offline-to-Cloud Sync Waves */}
            <div className="lg:col-span-6 flex justify-center order-2 lg:order-1">
              <div className="relative w-full max-w-[440px] rounded-3xl p-4 sm:p-6 bg-white/10 backdrop-blur-xs border border-white/20 shadow-xl overflow-hidden">
                <div className="absolute top-4 left-6 text-amber-100 font-mono text-[11px] font-bold tracking-widest uppercase flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                  Station 03 • Family Care &amp; Sync
                </div>

                <svg
                  viewBox="0 0 400 280"
                  className="w-full h-auto mt-6"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  {/* Shady Banyan Tree Silhouettes in background */}
                  <path d="M20,180 C20,90 90,60 140,110 C160,80 230,80 240,130 C260,100 320,110 330,170" fill="#A86416" fillOpacity="0.5" />

                  {/* Warm Village Home Silhouette with sloping tiled roof */}
                  <g transform="translate(60, 110)">
                    {/* Walls */}
                    <rect x="20" y="45" width="80" height="60" rx="3" fill="#FFFBEB" stroke="#D97706" strokeWidth="2" />
                    {/* Tiled Roof */}
                    <polygon points="10,45 60,10 110,45" fill="#DC2626" />
                    {/* Door */}
                    <rect x="50" y="70" width="20" height="35" rx="3" fill="#78350F" />
                    {/* Window with wooden bars */}
                    <rect x="28" y="60" width="16" height="16" rx="2" fill="#FDE68A" stroke="#78350F" strokeWidth="1.5" />
                    <line x1="36" y1="60" x2="36" y2="76" stroke="#78350F" strokeWidth="1.5" />
                  </g>

                  {/* Protective Care Shield Emblem (Dignity & Protection) with subtle float */}
                  <g transform="translate(180, 75)" className="motion-safe:animate-float origin-center">
                    <path
                      d="M30,0 L60,12 C60,45 30,68 30,68 C30,68 0,45 0,12 Z"
                      fill="#15803D"
                      stroke="#86EFAC"
                      strokeWidth="2.5"
                    />
                    {/* Heart in Shield */}
                    <path
                      d="M30,42 C30,42 18,32 18,24 C18,19 22,16 26,18 C28,19 30,22 30,22 C30,22 32,19 34,18 C38,16 42,19 42,24 C42,32 30,42 30,42 Z"
                      fill="#FFFFFF"
                    />
                  </g>

                  {/* Caseworker Mobile Phone with Offline-to-Cloud Sync Pulse */}
                  <g transform="translate(265, 120)">
                    {/* Smartphone silhouette */}
                    <rect x="10" y="20" width="40" height="70" rx="8" fill="#1E293B" stroke="#64748B" strokeWidth="2" />
                    <rect x="14" y="28" width="32" height="52" rx="4" fill="#047857" />
                    <text x="18" y="55" fill="#86EFAC" fontSize="8" fontWeight="bold" fontFamily="monospace">SAVED</text>
                    <text x="18" y="65" fill="#FFFFFF" fontSize="7" fontFamily="monospace">OFFLINE</text>

                    {/* Radiating Sync Pulse Wave Rings towards Cloud */}
                    <g className="motion-safe:animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]">
                      <circle cx="30" cy="20" r="14" stroke="#FEF08A" strokeWidth="2" fill="none" opacity="0.8" />
                      <circle cx="30" cy="20" r="24" stroke="#FEF08A" strokeWidth="1.5" fill="none" opacity="0.5" />
                    </g>

                    {/* Central Sync Cloud Destination with gentle drift */}
                    <g transform="translate(10, -50)" className="motion-safe:animate-float-slow">
                      <path
                        d="M20,20 C14,20 10,25 10,30 C6,30 4,34 4,38 C4,42 7,45 12,45 L40,45 C45,45 48,41 48,37 C48,33 45,30 41,30 C41,24 35,20 30,20 C27,20 23,22 20,25 Z"
                        fill="#FFFFFF"
                        stroke="#CBD5E1"
                        strokeWidth="1.5"
                      />
                      <path d="M26,38 L26,30 L22,34 M26,30 L30,34" stroke="#047857" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  </g>

                  {/* Completed Continuous Journey Dotted Trail - Scroll Animated */}
                  <path
                    d="M10,240 Q100,220 200,230 T390,220"
                    stroke="#FEF3C7"
                    strokeWidth="3"
                    strokeDasharray="10 6"
                    strokeDashoffset={350 * (1 - Math.min(Math.max((scrollProgress - 0.5) * 3, 0), 1))}
                    fill="none"
                    className="support-path-draw transition-[stroke-dashoffset] duration-150 ease-out"
                  />
                </svg>
              </div>
            </div>

            {/* Pinned Family Accord Slip */}
            <div className="lg:col-span-6 order-1 lg:order-2">
              <div className="relative p-6 sm:p-8 rounded-2xl bg-[#FCFAF6] text-slate-900 border border-[#D5C2AA] shadow-xl notebook-paper-sheet">
                {/* Washi Tape Accent */}
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 notebook-tape rounded-xs pointer-events-none"
                  aria-hidden="true"
                />

                <div className="flex items-center justify-between gap-2 mb-4 pt-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                    Section 1 &amp; 2 • Legal &amp; Household Aid
                  </span>
                  <div className="text-[11px] font-mono font-bold text-slate-500">
                    STATION // 03
                  </div>
                </div>

                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
                  Family &amp; Caregiver Support
                </h3>

                <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-normal mb-6">
                  Documenting legal guardianship, verified caregiver consent, household economic stability, and banking details to enable direct educational aid.
                </p>

                <div className="pt-4 border-t border-[#E8DFD1]">
                  <h4 className="text-[11px] font-mono font-bold uppercase text-slate-500 mb-3 tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-700" />
                    Key Observables
                  </h4>
                  <ul className="space-y-2.5 text-xs sm:text-sm font-medium text-slate-800">
                    {['Caregiver consent & signature', 'Aadhaar data minimization', 'Direct benefit transfer alignment'].map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <span className="w-4 h-4 rounded-xs border border-emerald-700/60 bg-emerald-50 text-emerald-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          ✓
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          Torn Paper Transition back to Warm Cotton Parchment
      ══════════════════════════════════════════════════════════════════ */}
      <div className="w-full overflow-hidden leading-none relative z-10 -mb-1 bg-[#C67E20]">
        <svg
          className="relative block w-full h-12 sm:h-20 text-[#FAF7F2]"
          viewBox="0 0 1440 90"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M0,58 L40,54 L90,62 L150,56 L210,65 L280,59 L350,67 L420,58 L490,64 L560,57 L630,66 L700,59 L770,68 L840,58 L910,65 L980,57 L1050,66 L1120,58 L1190,65 L1260,57 L1330,64 L1400,56 L1440,62 L1440,90 L0,90 Z"
            fill="#FAF7F2"
          />
        </svg>
      </div>

      {/* Field Dignity Directive Banner */}
      <div className="bg-[#FAF7F2] py-8 sm:py-12 border-b border-[#E4D8C7]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-5 sm:p-6 rounded-2xl bg-[#EDE4D4] border border-[#D2BFA8] flex items-start gap-3.5 text-xs sm:text-sm text-slate-800 font-medium shadow-xs">
            <HeartHandshake className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5" />
            <p>
              <strong className="text-slate-900 font-bold">Field Dignity Directive:</strong> The Child Nutrition &amp; Support PWA serves as a structured intake tool to assist
              trained case managers. The platform does not make automated medical decisions or replace clinical judgment; it ensures 
              information is preserved accurately and made available for thoughtful human follow-up.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
