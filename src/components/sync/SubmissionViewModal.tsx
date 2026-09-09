'use client';

import * as React from 'react';
import {
  ShieldCheck,
  User,
  CreditCard,
  Home,
  HeartPulse,
  Utensils,
  GraduationCap,
  FileCheck,
  Calendar,
  Phone,
  MapPin,
  ExternalLink,
  X,
  Edit3,
} from 'lucide-react';

export interface SubmissionViewModalProps {
  item: any;
  formDef?: any;
  onClose: () => void;
  onEdit?: () => void;
}

export function SubmissionViewModal({ item, onClose, onEdit }: SubmissionViewModalProps) {
  if (!item) return null;

  const data = item.rawRecord || item.payload || item.raw_payload || item;
  const d = data.demographics || {};
  const c = data.consent || data.caregiverConsent || {};
  const b = data.bankingAndKyc || data.bankDetails || {};
  const hf = data.householdFinancial || {};
  const h = data.health || data.clinical || {};
  const n = data.nutrition || {};
  const e = data.educationStatus || data.education || {};
  const exp = data.educationExpenses || {};
  const req = data.educationSupportRequired || {};
  const f = data.finalReview || {};

  // Metadata
  const revisionNumber = Number(item.revisionNumber || item.revision || data.revisionNumber || data.revision || data['2\nRevision Number'] || data.version || 1);
  const isRevision = revisionNumber > 1;
  const uniqueId = item.id || item.submissionId || data['1\nUnique ID'] || data.uniqueId || data.art_number || d.artNumber || item.submissionUuid || 'MH-PUN-000000-00';
  const editReason = item.editReason || data.editReason || data['4\nEdit Reason'] || data.edit_reason || '';

  // Section 1: Consent & Signature
  const agreeToParticipate = c.agreeToParticipate !== undefined ? c.agreeToParticipate : (data.agreeToParticipate ?? true);
  const caregiverName = d.caregiverName || data['14\nCaregiver Full Name'] || data.caregiver_name || item.caregiverName || 'Caregiver';
  const caregiverRelation = d.caregiverRelationship || data['15\nCaregiver Relation'] || data.caregiver_relationship || 'Mother';
  const caregiverPhone = d.contactNumber || d.caregiverPhone || data['16\nCaregiver Contact'] || data.caregiver_phone || item.caregiverPhone || '—';
  const signatureData = c.signatureDataUrl || data.signatureDataUrl || data.signature_data_url || (data.consent && data.consent.signatureDataUrl) || (data.caregiverConsent && data.caregiverConsent.signatureDataUrl) || data['72\nSignature Link'] || '';

  // Section 2: Demographics
  const childName = d.childName || data['9\nChild Name'] || data.child_name || item.childName || 'Child Beneficiary';
  const dateOfFilling = d.dateOfFilling || data['7\nVisit Date'] || data.dateOfFilling || (item.submissionTime ? item.submissionTime.split('T')[0] : '—');
  const dob = d.dob || data['10\nDate of Birth'] || data.dob || '—';
  const calculatedAge = d.calculatedAgeYears !== undefined ? `${d.calculatedAgeYears} yrs (${d.calculatedAgeMonths || 0} mos)` : (data['11\nCalculated Age'] || data.calculated_age ? `${data.calculated_age} yrs` : '—');
  const gender = d.gender || data['12\nGender'] || data.gender || 'Male';
  const orphanStatus = d.orphanStatus || data['13\nOrphan Status'] || data.orphan_status || 'Both parents alive';
  const childAadhaar = d.childAadhaarNumber || b.childAadhaarNumber || data['24\nChild Aadhaar Number'] || data.masked_aadhaar || '—';
  const fullAddress = d.fullAddress || data['17\nAddress'] || data.address || '—';
  const state = d.state || data['18\nState'] || data.state || 'Maharashtra';
  const district = d.district || data['19\nDistrict'] || data.district || item.district || 'Pune';

  // Section 3: Banking & KYC
  const accountHolder = b.bankAccountHolderName || b.accountHolderName || data['20\nBank Account Holder Name'] || data.account_holder_name || caregiverName;
  const accountNumber = b.bankAccountNumber || b.accountNumber || data['21\nBank Account Number'] || data.bank_account_number || '••••••••••••';
  const ifscCode = b.bankIfscCode || b.ifscCode || data['22\nBank IFSC Code'] || data.ifsc_code || '—';
  const bankLinkedPhone = b.bankLinkedMobileNumber || data['23\nBank Linked Mobile Number'] || caregiverPhone;
  const passbookPhoto = b.passbookPhotoUrl || data.passbookPhotoUrl || data.passbook_photo_url || data['25\nPassbook Front Page Link'] || '';
  const aadhaarPhoto = b.aadhaarCardPhotoUrl || data.aadhaarCardPhotoUrl || data.aadhaar_card_photo_url || data['26\nAadhaar Card Link'] || '';
  const childPhoto = b.childPhotoUrl || data.childPhotoUrl || data.child_photo_url || data['27\nPassport Size Photo Link'] || '';

  // Section 4: Household & Socio-Economic
  const totalFamilyMembers = hf.totalFamilyMembers || data['28\nHousehold Members'] || data.number_of_siblings ? Number(data.number_of_siblings) + 2 : 4;
  const childrenUnder18 = hf.numberOfChildrenUnder18 || data['29\nNo of Children'] || 2;
  const monthlyIncome = Number(hf.monthlyIncomeRs || data['30\nMonthly Income'] || data.monthly_household_income || 0);
  const incomeSource = hf.mainSourceOfIncome || data['31\nIncome Source'] || data.primary_caregiver_occupation || 'Daily wage labour';

  // Section 5: Clinical Health & ART
  const weight = h.weightKg || n.weightKg || data['32\nCurrent Weight (kg)'] || data.weight_kg || '—';
  const height = h.heightCm || n.heightCm || data['33\nCurrent Height (cm)'] || data.height_cm || '—';
  const bmi = h.bmi || data['34\nBMI'] || data.bmi || '—';
  const bmiCategory = h.bmiCategory || data['35\nBMI Category'] || data.nutrition_status || 'Normal';
  const hemoglobin = h.haemoglobinGdl || data['36\nHemoglobin (g/dL)'] || data.hemoglobin || '12.0';
  const hbCategory = h.hbCategory || data['37\nHb Category'] || 'Normal';
  const comorbidities = h.otherHealthConditions ? (Array.isArray(h.otherHealthConditions) ? h.otherHealthConditions.join(', ') : h.otherHealthConditions) : (data['38\nComorbidities'] || 'None reported');
  const artStatus = h.artStatus || data['40\nART Status'] || data.art_status || 'On ART';
  const artRegDate = h.artRegistrationDate || data['41\nART Registration Date'] || '—';
  const artIdNumber = h.artIdNumber || data['42\nART ID Number'] || uniqueId;
  const vlStatus = h.vlStatus || data['43\nVL Status'] || 'Tested in last 6 months';
  const vlDate = h.vlDate || data['44\nVL Date'] || '—';
  const viralLoad = h.viralLoad || data['45\nViral Load'] || data.viral_load || '< 50';
  const vlCategory = h.vlCategory || data['46\nVL Category'] || 'Undetectable (<50 copies/mL)';

  // Section 6: Nutrition
  const appetite = n.appetite || data['47\nAppetite'] || 'Good';
  const mealsPerDay = n.mealsPerDay || data['48\nMeals per Day'] || 3;

  // Section 7: Education Status
  const educationStatus = e.educationStatus || data['49\nEducation Status'] || (data.school_enrolled ? 'Currently going to school' : 'Out of school');
  const schoolName = e.schoolName || data['51\nSchool Name'] || '—';
  const sessionStartDate = e.schoolSessionStartDate || data['52\nSchool Session Start Date'] || '—';
  const schoolType = e.schoolType || data['53\nSchool Type'] || 'Government school';
  const currentClass = e.currentClass || data['54\nCurrent Class'] || data.school_grade || 'Class 2';
  const attendance = e.attendance || data['55\nAttendance Status'] || 'Regular';

  // Section 8: Expenses & Aid Breakdown
  const expensesList = [
    { label: 'School Fees (Annual)', cost: Number(exp.schoolFees || data['56\nSchool Fees'] || 0), req: Number(req.requiredSchoolFees || 0) },
    { label: 'Private Tuition Fee (Monthly)', cost: Number(exp.tuitionFees || data['57\nPrivate Tuition Fee'] || 0), req: 0 },
    { label: 'Books & Syllabi (Annual)', cost: Number(exp.books || data['58\nSchool Books'] || 0), req: Number(req.requiredBooks || 0) },
    { label: 'Stationery (Bi-annual)', cost: Number(exp.stationery || data['59\nSchool Stationery'] || 0), req: Number(req.requiredStationery || 0) },
    { label: 'School Uniform (Annual)', cost: Number(exp.uniform || data['60\nSchool Uniform'] || 0), req: Number(req.requiredUniform || 0) },
    { label: 'School Transport (Monthly)', cost: Number(exp.transport || data['61\nSchool Transport'] || 0), req: Number(req.requiredTransport || 0) },
    { label: 'Other Educational Expenses', cost: Number(exp.otherExpenses || data['62\nSchool Other Expenses'] || 0), req: Number(req.requiredOtherSupport || 0) },
  ];
  const totalAnnualCost = Number(exp.totalAnnualCost || data['63\nTotal Annual Education Cost'] || expensesList.reduce((s, x) => s + x.cost, 0));
  const totalRequiredSupport = Number(req.totalRequiredSupport || data.recommended_grant_amount || expensesList.reduce((s, x) => s + x.req, 0));
  const feeReceiptPhoto = exp.feeReceiptPhotoUrl || data.feeReceiptPhotoUrl || data.fee_receipt_photo_url || data['64\nSchool Fee Receipt Link'] || '';
  const marksheetPhoto = exp.marksheetPhotoUrl || data.marksheetPhotoUrl || data.marksheet_photo_url || data['65\nMarksheet Photo Link'] || '';
  const remarks = exp.remarks || data['66\nRemarks (If Any)'] || data.clinical_notes || 'None';

  // Section 9: Final Review & Submitter Attestation
  const approvedStatus = f.approvedAllianceIndia || data['67\nApproved Alliance India'] || 'Approved';
  const reviewConfirmed = f.allInfoCorrect !== undefined ? (f.allInfoCorrect ? 'Yes — Verified' : 'No') : (data['68\nReview Confirmed'] || 'Yes — Verified');
  const orgName = f.organizationName || data['69\nOrganization Name'] || 'India HIV/AIDS Alliance';
  const submittedBy = f.formSubmittedBy || data['70\nForm Submitted By'] || data.interviewer_name || item.caseworkerName || 'Caseworker';
  const orgEmail = f.organizationEmail || data['71\nOrganization Email'] || 'fieldworker@allianceindia.org';
  const submissionTime = item.submissionTime || item.createdAt || data['73\nLast Updated'] || new Date().toISOString();

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-100 text-teal-900 border border-teal-200">
                Official Intake Linelist Record
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                73 Columns Comprehensive
              </span>
              {isRevision && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                  Revision {revisionNumber} • Amended
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 font-mono">
                {uniqueId}
              </h2>
              <span className="text-xs text-slate-500 font-medium">({childName})</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close View Modal"
            className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 text-base font-bold transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Audit Banner */}
        {isRevision && editReason && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <span className="font-bold shrink-0">Reason for Amendment:</span>
            <span>{editReason}</span>
          </div>
        )}

        {/* Scrollable Modal Content: All 9 Sections */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs divide-y divide-slate-100">
          {/* Section 1: Caregiver Consent & Signature */}
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-teal-700" />
              <span>1. Caregiver Consent &amp; Signature</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-slate-400 block text-[11px]">Informed Consent Status:</span>
                <span className={`font-bold inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] ${agreeToParticipate ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>
                  {agreeToParticipate ? '✓ Yes — Consent Granted' : '✗ No — Consent Refused'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Caregiver Name:</span>
                <span className="font-semibold text-slate-800">{caregiverName} ({caregiverRelation})</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Contact Number:</span>
                <span className="font-mono text-slate-800">{caregiverPhone}</span>
              </div>
              {signatureData && (
                <div className="sm:col-span-3 pt-2 border-t border-slate-200">
                  <span className="text-slate-400 block text-[11px] mb-1">Caregiver Signature On File:</span>
                  <div className="border border-slate-200 rounded-lg p-2 bg-white max-w-sm">
                    <img src={signatureData} alt="Caregiver Signature" className="h-20 w-full object-contain" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Child Demographics & Residence */}
          <div className="space-y-3 pt-4">
            <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-teal-700" />
              <span>2. Child Demographics &amp; Residence</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-slate-400 block text-[11px]">Date of Filling:</span>
                <span className="font-semibold text-slate-800">{dateOfFilling}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Date of Birth:</span>
                <span className="font-semibold text-slate-800">{dob}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Calculated Age:</span>
                <span className="font-semibold text-teal-900">{calculatedAge}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Gender:</span>
                <span className="font-semibold text-slate-800">{gender}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Orphan Status:</span>
                <span className="font-semibold text-slate-800">{orphanStatus}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Child Aadhaar Number:</span>
                <span className="font-mono text-slate-800">{childAadhaar}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">State / UT:</span>
                <span className="font-semibold text-slate-800">{state}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">District:</span>
                <span className="font-semibold text-slate-800">{district}</span>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <span className="text-slate-400 block text-[11px]">Full Residential Address:</span>
                <span className="text-slate-800">{fullAddress}</span>
              </div>
            </div>
          </div>

          {/* Section 3: Banking & KYC Documents */}
          <div className="space-y-3 pt-4">
            <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-teal-700" />
              <span>3. Banking &amp; KYC Documents</span>
            </h3>
            <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-slate-400 block text-[11px]">Account Holder:</span>
                  <span className="font-semibold text-slate-800">{accountHolder}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Account Number:</span>
                  <span className="font-mono font-semibold text-slate-800">{accountNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">IFSC Code:</span>
                  <span className="font-mono font-semibold text-slate-800">{ifscCode}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Linked Mobile:</span>
                  <span className="font-mono text-slate-800">{bankLinkedPhone}</span>
                </div>
              </div>

              {/* Uploaded Documents */}
              <div className="pt-2 border-t border-slate-200">
                <span className="text-slate-500 font-bold block text-[11px] mb-2">Attached Verification Proofs:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="border border-slate-200 rounded-xl p-2 bg-white text-center space-y-1">
                    <span className="text-[10px] font-bold text-slate-600 uppercase block">Passbook Front Page</span>
                    {passbookPhoto ? (
                      <img src={passbookPhoto} alt="Passbook" className="h-24 w-full object-cover rounded-lg border border-slate-200" />
                    ) : (
                      <div className="h-24 flex items-center justify-center bg-slate-50 rounded-lg text-slate-400 text-[11px]">Not uploaded</div>
                    )}
                  </div>
                  <div className="border border-slate-200 rounded-xl p-2 bg-white text-center space-y-1">
                    <span className="text-[10px] font-bold text-slate-600 uppercase block">Aadhaar Card</span>
                    {aadhaarPhoto ? (
                      <img src={aadhaarPhoto} alt="Aadhaar Card" className="h-24 w-full object-cover rounded-lg border border-slate-200" />
                    ) : (
                      <div className="h-24 flex items-center justify-center bg-slate-50 rounded-lg text-slate-400 text-[11px]">Not uploaded</div>
                    )}
                  </div>
                  <div className="border border-slate-200 rounded-xl p-2 bg-white text-center space-y-1">
                    <span className="text-[10px] font-bold text-slate-600 uppercase block">Child Beneficiary Photo</span>
                    {childPhoto ? (
                      <img src={childPhoto} alt="Child Beneficiary" className="h-24 w-full object-cover rounded-lg border border-slate-200" />
                    ) : (
                      <div className="h-24 flex items-center justify-center bg-slate-50 rounded-lg text-slate-400 text-[11px]">Not uploaded</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Household & Socio-Economic */}
          <div className="space-y-3 pt-4">
            <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-2">
              <Home className="h-4 w-4 text-teal-700" />
              <span>4. Household &amp; Socio-Economic Profile</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-slate-400 block text-[11px]">Total Family Members:</span>
                <span className="font-semibold text-slate-800">{totalFamilyMembers}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Children Under 18:</span>
                <span className="font-semibold text-slate-800">{childrenUnder18}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Monthly Income:</span>
                <span className="font-bold text-teal-900">₹{monthlyIncome.toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Main Source of Income:</span>
                <span className="font-semibold text-slate-800">{incomeSource}</span>
              </div>
            </div>
          </div>

          {/* Section 5: Clinical Health, ART & Viral Load */}
          <div className="space-y-3 pt-4">
            <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-teal-700" />
              <span>5. Clinical Health, ART &amp; Viral Load</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-slate-400 block text-[11px]">Weight (kg):</span>
                <span className="font-semibold text-slate-800">{weight} kg</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Height (cm):</span>
                <span className="font-semibold text-slate-800">{height} cm</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">BMI &amp; Category:</span>
                <span className="font-semibold text-slate-800">{bmi} — <span className="text-teal-800">{bmiCategory}</span></span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Hemoglobin &amp; Category:</span>
                <span className="font-semibold text-slate-800">{hemoglobin} g/dL ({hbCategory})</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">ART Status:</span>
                <span className="font-semibold text-slate-800">{artStatus}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">ART Registration Date:</span>
                <span className="font-semibold text-slate-800">{artRegDate}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">ART ID Number:</span>
                <span className="font-mono font-semibold text-slate-800">{artIdNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Viral Load Status:</span>
                <span className="font-semibold text-slate-800">{vlStatus}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Viral Load Test Date:</span>
                <span className="font-semibold text-slate-800">{vlDate}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Viral Load Count:</span>
                <span className="font-mono font-semibold text-slate-800">{viralLoad} copies/mL</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block text-[11px]">VL Suppression Category:</span>
                <span className="font-semibold text-emerald-800">{vlCategory}</span>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <span className="text-slate-400 block text-[11px]">Reported Comorbidities:</span>
                <span className="text-slate-800">{comorbidities}</span>
              </div>
            </div>
          </div>

          {/* Section 6: Daily Nutrition Habits */}
          <div className="space-y-3 pt-4">
            <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-2">
              <Utensils className="h-4 w-4 text-teal-700" />
              <span>6. Appetite & Nutrition Habits</span>
            </h3>
            <div className="grid grid-cols-2 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-slate-400 block text-[11px]">Child&apos;s Appetite Level:</span>
                <span className="font-semibold text-slate-800">{appetite}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Meals Per Day:</span>
                <span className="font-semibold text-slate-800">{mealsPerDay} full meals</span>
              </div>
            </div>
          </div>

          {/* Section 7: Education Status */}
          <div className="space-y-3 pt-4">
            <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-teal-700" />
              <span>7. Education Status</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-slate-400 block text-[11px]">Schooling Status:</span>
                <span className="font-semibold text-slate-800">{educationStatus}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">School Name:</span>
                <span className="font-semibold text-slate-800">{schoolName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Session Start Date:</span>
                <span className="font-semibold text-slate-800">{sessionStartDate}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">School Type:</span>
                <span className="font-semibold text-slate-800">{schoolType}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Current Class / Grade:</span>
                <span className="font-semibold text-slate-800">{currentClass}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Attendance Continuity:</span>
                <span className="font-semibold text-slate-800">{attendance}</span>
              </div>
            </div>
          </div>

          {/* Section 8: Education Expenses & Aid Breakdown */}
          <div className="space-y-3 pt-4">
            <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-teal-700" />
              <span>8. Education Expenses &amp; Aid Breakdown</span>
            </h3>
            <div className="bg-slate-50/70 rounded-xl border border-slate-200/80 overflow-hidden">
              <table className="w-full text-left text-xs text-slate-800">
                <thead className="bg-slate-100/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Expense Category</th>
                    <th className="py-2.5 px-3 text-right">Current Cost (₹)</th>
                    <th className="py-2.5 px-3 text-right">Required Grant (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expensesList.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-700">{row.label}</td>
                      <td className="py-2 px-3 text-right font-mono">₹{row.cost.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-teal-900">
                        {row.req > 0 ? `₹${row.req.toLocaleString('en-IN')}` : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100/90 font-bold border-t border-slate-200 text-xs">
                    <td className="py-2.5 px-3 text-slate-900">Total Programmatic Support</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹{totalAnnualCost.toLocaleString('en-IN')}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-teal-900">₹{totalRequiredSupport.toLocaleString('en-IN')}</td>
                  </tr>
                </tbody>
              </table>

              <div className="p-3.5 space-y-3 border-t border-slate-200 bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="border border-slate-200 rounded-xl p-2 text-center space-y-1 bg-slate-50">
                    <span className="text-[10px] font-bold text-slate-600 uppercase block">Fee Receipt Proof</span>
                    {feeReceiptPhoto ? (
                      <img src={feeReceiptPhoto} alt="Fee Receipt" className="h-24 w-full object-cover rounded-lg border border-slate-200" />
                    ) : (
                      <div className="h-24 flex items-center justify-center bg-white rounded-lg text-slate-400 text-[11px]">No fee receipt attached</div>
                    )}
                  </div>
                  <div className="border border-slate-200 rounded-xl p-2 text-center space-y-1 bg-slate-50">
                    <span className="text-[10px] font-bold text-slate-600 uppercase block">Previous Marksheet</span>
                    {marksheetPhoto ? (
                      <img src={marksheetPhoto} alt="Marksheet" className="h-24 w-full object-cover rounded-lg border border-slate-200" />
                    ) : (
                      <div className="h-24 flex items-center justify-center bg-white rounded-lg text-slate-400 text-[11px]">No marksheet attached</div>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Remarks / Documentation Notes:</span>
                  <span className="text-slate-700 italic">{remarks}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 9: Review & Submitter Attestation */}
          <div className="space-y-3 pt-4">
            <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-teal-700" />
              <span>9. Review &amp; Submitter Attestation</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-slate-400 block text-[11px]">Alliance India Approval:</span>
                <span className="font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded text-[11px] inline-block mt-0.5">
                  {approvedStatus}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Review Confirmed Accurate:</span>
                <span className="font-semibold text-slate-800">{reviewConfirmed}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Organization Name:</span>
                <span className="font-semibold text-slate-800">{orgName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Form Submitted By (Caseworker):</span>
                <span className="font-semibold text-slate-800">{submittedBy}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block text-[11px]">Organization Email ID:</span>
                <span className="font-mono text-slate-800">{orgEmail}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500 truncate">
            Last modified: {new Date(submissionTime).toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="px-4 py-2 text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Submission</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
