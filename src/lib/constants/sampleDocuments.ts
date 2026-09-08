/**
 * High-fidelity SVG Data URLs representing uploaded verification documents
 * Used for seed records, mock sheet synchronization, and visual previews.
 */

export const SAMPLE_PASSBOOK_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260" width="100%" height="100%">
  <rect width="420" height="260" rx="14" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/>
  <rect width="420" height="52" rx="14" fill="#1e3a8a"/>
  <rect y="40" width="420" height="12" fill="#1e3a8a"/>
  <text x="24" y="32" fill="#ffffff" font-family="sans-serif" font-size="15" font-weight="bold">STATE BANK OF INDIA - PASSBOOK</text>
  <text x="320" y="32" fill="#93c5fd" font-family="sans-serif" font-size="11" font-weight="bold">MAHARASHTRA</text>
  <g fill="#1e293b" font-family="monospace" font-size="11">
    <text x="24" y="85">A/C NAME : RAHUL MANOJ S. (F: MANOJ S.)</text>
    <text x="24" y="110">A/C NO   : 123456789012</text>
    <text x="24" y="135">IFSC     : SBIN0001234 (PUNE MAIN BRANCH)</text>
    <text x="24" y="160">A/C TYPE : SAVINGS BANK (DBT ENABLED)</text>
    <text x="24" y="185">STATUS   : ACTIVE &amp; SEEDED WITH AADHAAR</text>
  </g>
  <circle cx="340" cy="150" r="32" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-dasharray="5,2"/>
  <text x="312" y="154" fill="#dc2626" font-family="sans-serif" font-size="9" font-weight="bold">SBI VERIFIED</text>
  <rect x="20" y="210" width="380" height="34" rx="8" fill="#e2e8f0"/>
  <text x="30" y="232" fill="#475569" font-family="sans-serif" font-size="10" font-weight="bold">MICR: 411002001 • VALIDATED FOR PAEDIATRIC NUTRITION DIRECT TRANSFER</text>
</svg>`)}`;
export const SAMPLE_AADHAAR_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260" width="100%" height="100%">
  <rect width="420" height="260" rx="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <rect width="420" height="14" rx="14" fill="#f97316"/>
  <rect y="8" width="420" height="6" fill="#f97316"/>
  <rect y="246" width="420" height="14" rx="14" fill="#15803d"/>
  <rect y="246" width="420" height="6" fill="#15803d"/>
  <text x="120" y="38" fill="#b91c1c" font-family="sans-serif" font-size="12" font-weight="bold">GOVERNMENT OF INDIA / भारत सरकार</text>
  <text x="135" y="54" fill="#0f172a" font-family="sans-serif" font-size="10">UNIQUE IDENTIFICATION AUTHORITY OF INDIA</text>
  <rect x="24" y="72" width="75" height="96" rx="8" fill="#e2e8f0" stroke="#94a3b8"/>
  <circle cx="61" cy="106" r="20" fill="#64748b"/>
  <path d="M40 155 C40 132, 82 132, 82 155" fill="#64748b"/>
  <g fill="#1e293b" font-family="sans-serif" font-size="11">
    <text x="120" y="90" font-weight="bold">Manoj S.</text>
    <text x="120" y="112" fill="#64748b">DOB / जन्म तिथि: 12/05/1988</text>
    <text x="120" y="134" fill="#64748b">Gender / लिंग: Male / पुरुष</text>
    <text x="120" y="156" fill="#64748b">Relation: Father / पिता</text>
  </g>
  <rect x="24" y="188" width="372" height="42" rx="8" fill="#f1f5f9" stroke="#e2e8f0"/>
  <text x="80" y="215" fill="#0f172a" font-family="monospace" font-size="16" font-weight="bold" letter-spacing="4">XXXX  XXXX  5566</text>
</svg>`)}`;
export const SAMPLE_CHILD_PHOTO_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="100%" height="100%">
  <rect width="320" height="320" rx="16" fill="#f0f9ff" stroke="#bae6fd" stroke-width="2"/>
  <circle cx="160" cy="120" r="60" fill="#fed7aa"/>
  <path d="M110 110 Q160 65 210 110 Q205 75 160 75 Q115 75 110 110 Z" fill="#1e293b"/>
  <circle cx="140" cy="120" r="7" fill="#0f172a"/>
  <circle cx="180" cy="120" r="7" fill="#0f172a"/>
  <path d="M148 145 Q160 156 172 145" stroke="#be185d" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M85 285 C85 210, 235 210, 235 285" fill="#0284c7"/>
  <rect x="20" y="255" width="280" height="46" rx="10" fill="#0f172a" opacity="0.9"/>
  <text x="160" y="284" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">BENEFICIARY: RAHUL MANOJ S.</text>
</svg>`)}`;
export const SAMPLE_FEE_RECEIPT_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260" width="100%" height="100%">
  <rect width="420" height="260" rx="14" fill="#fffbeb" stroke="#fcd34d" stroke-width="2"/>
  <rect width="420" height="46" rx="14" fill="#d97706"/>
  <rect y="34" width="420" height="12" fill="#d97706"/>
  <text x="24" y="30" fill="#ffffff" font-family="sans-serif" font-size="13" font-weight="bold">SARASWATI VIDYALAYA - OFFICIAL FEE RECEIPT</text>
  <g fill="#334155" font-family="sans-serif" font-size="11">
    <text x="24" y="78"><tspan font-weight="bold">Receipt No:</tspan> REC-2026-0891</text>
    <text x="240" y="78"><tspan font-weight="bold">Date:</tspan> 15/06/2026</text>
    <text x="24" y="104"><tspan font-weight="bold">Student:</tspan> Rahul Manoj S. (Class 2)</text>
    <text x="240" y="104"><tspan font-weight="bold">Roll No:</tspan> 14</text>
    <text x="24" y="130">Annual Admission &amp; Tuition Fee: ₹2,500</text>
    <text x="24" y="152">Library &amp; Laboratory Contribution: ₹500</text>
    <text x="24" y="184" font-weight="bold" fill="#0f172a" font-size="13">TOTAL AMOUNT PAID: ₹3,000 (PAID IN FULL)</text>
  </g>
  <circle cx="340" cy="180" r="32" fill="none" stroke="#15803d" stroke-width="2.5"/>
  <text x="314" y="184" fill="#15803d" font-family="sans-serif" font-size="9" font-weight="bold">FEES VERIFIED</text>
</svg>`)}`;
export const SAMPLE_MARKSHEET_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260" width="100%" height="100%">
  <rect width="420" height="260" rx="14" fill="#f0fdf4" stroke="#86efac" stroke-width="2"/>
  <rect width="420" height="46" rx="14" fill="#16a34a"/>
  <rect y="34" width="420" height="12" fill="#16a34a"/>
  <text x="24" y="30" fill="#ffffff" font-family="sans-serif" font-size="13" font-weight="bold">ANNUAL ACADEMIC PROGRESS REPORT (2025-26)</text>
  <g fill="#1e293b" font-family="sans-serif" font-size="11">
    <text x="24" y="78"><tspan font-weight="bold">Student Name:</tspan> Rahul Manoj S.</text>
    <text x="240" y="78"><tspan font-weight="bold">Standard:</tspan> Class 1 (Passed)</text>
    <text x="24" y="104">Languages (English &amp; Marathi): Grade A (82%)</text>
    <text x="24" y="126">Mathematics &amp; Logic: Grade A (85%)</text>
    <text x="24" y="148">Environmental Studies: Grade B+ (78%)</text>
    <text x="24" y="178" font-weight="bold" fill="#15803d" font-size="12">STATUS: PROMOTED TO CLASS 2 | Attendance: 91%</text>
  </g>
  <circle cx="345" cy="195" r="28" fill="none" stroke="#16a34a" stroke-width="2"/>
  <text x="323" y="198" fill="#16a34a" font-family="sans-serif" font-size="8" font-weight="bold">HEADMASTER</text>
</svg>`)}`;
export const SAMPLE_CAREGIVER_SIGNATURE_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="100%" height="100%">
  <path d="M 60 140 Q 90 40 120 120 Q 140 70 170 130 Q 190 100 220 125 Q 240 60 270 140 M 290 80 Q 320 60 360 85 Q 400 120 380 140 Q 340 150 420 130 M 440 70 L 440 145 M 420 100 L 460 100" stroke="#0f172a" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="60" y="180" fill="#64748b" font-family="sans-serif" font-size="13" font-style="italic">Digitally Verified Caregiver Signature: Manoj S.</text>
</svg>`)}`;
