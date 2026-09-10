'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BMICategory, VLCategory, HbCategory } from '@/types/domain';

export interface BeneficiaryDocumentStatus {
  isComplete: boolean;
  totalRequired: number;
  uploadedCount: number;
  pendingDocs: string[];
  uploadedDocs: string[];
}

export interface SupervisorBeneficiaryRow {
  id: string;
  artNumber: string;
  childName: string;
  age: number;
  gender: string;
  district: string;
  state: string;
  schoolType: string;
  schoolEnrolled: boolean;
  orphanStatus: string;
  bmi: number;
  bmiCategory: BMICategory;
  viralLoad: string;
  vlCategory: VLCategory;
  hemoglobin: string;
  hbCategory: HbCategory;
  grantAmount: number;
  syncState: 'SYNCED' | 'QUEUED';
  lastVisit: string;
  version: number;
  documentStatus: BeneficiaryDocumentStatus;
  isApproved: boolean;
  approvedStatus: string;
}

export type SupervisorDataStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface SupervisorDataError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface SupervisorDataHook {
  status: SupervisorDataStatus;
  records: SupervisorBeneficiaryRow[];
  total: number;
  lastRefreshed: Date | null;
  error: SupervisorDataError | null;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  setRecords: React.Dispatch<React.SetStateAction<SupervisorBeneficiaryRow[]>>;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
}

function isFieldPresent(val: any): boolean {
  if (val === true) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return false;
    if (trimmed === '—' || trimmed === '-' || trimmed === 'N/A' || trimmed === 'n/a') return false;
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('not uploaded') ||
      lower.includes('no fee receipt') ||
      lower.includes('no marksheet') ||
      lower === 'none' ||
      lower === 'null' ||
      lower === 'undefined'
    ) {
      return false;
    }
    return true;
  }
  return false;
}

export function evaluateDocuments(it: any, schoolTypeStr: string): BeneficiaryDocumentStatus {
  const pendingDocs: string[] = [];
  const uploadedDocs: string[] = [];

  // 1. Bank Passbook Front Page
  const passbook =
    it['25\nPassbook Front Page Link'] ||
    it['25\\nPassbook Front Page Link'] ||
    it['Passbook Front Page Link'] ||
    it['passbook front page link'] ||
    it.passbookPhotoUrl ||
    it.passbook_photo_url ||
    it.bankingAndKyc?.passbookPhotoUrl ||
    it.bankDetails?.passbookPhotoCaptured ||
    it.raw_payload?.bankingAndKyc?.passbookPhotoUrl;
  if (isFieldPresent(passbook)) {
    uploadedDocs.push('Bank Passbook Front Page');
  } else {
    pendingDocs.push('Bank Passbook Front Page');
  }

  // 2. Aadhaar Card
  const aadhaar =
    it['26\nAadhaar Card Link'] ||
    it['26\\nAadhaar Card Link'] ||
    it['Aadhaar Card Link'] ||
    it['aadhaar card link'] ||
    it.aadhaarCardPhotoUrl ||
    it.aadhaar_card_photo_url ||
    it.bankingAndKyc?.aadhaarCardPhotoUrl ||
    it.raw_payload?.bankingAndKyc?.aadhaarCardPhotoUrl;
  if (isFieldPresent(aadhaar)) {
    uploadedDocs.push('Aadhaar Card');
  } else {
    pendingDocs.push('Aadhaar Card');
  }

  // 3. Child Beneficiary Photo
  const childPhoto =
    it['27\nPassport Size Photo Link'] ||
    it['27\\nPassport Size Photo Link'] ||
    it['Passport Size Photo Link'] ||
    it['passport size photo link'] ||
    it.childPhotoUrl ||
    it.child_photo_url ||
    it.bankingAndKyc?.childPhotoUrl ||
    it.raw_payload?.bankingAndKyc?.childPhotoUrl;
  if (isFieldPresent(childPhoto)) {
    uploadedDocs.push('Child Beneficiary Photo');
  } else {
    pendingDocs.push('Child Beneficiary Photo');
  }

  // 4. Caregiver Consent Signature
  const signature =
    it['6\nSignature /\nThumb Impression'] ||
    it['72\nSignature Link'] ||
    it['72\\nSignature Link'] ||
    it['Signature Link'] ||
    it['signature link'] ||
    it.signatureDataUrl ||
    it.signature_data_url ||
    it.consent?.signatureDataUrl ||
    it.caregiverConsent?.signatureDataUrl ||
    it.raw_payload?.caregiverConsent?.signatureDataUrl ||
    it.raw_payload?.consent?.signatureDataUrl;
  if (isFieldPresent(signature)) {
    uploadedDocs.push('Caregiver Signature');
  } else {
    pendingDocs.push('Caregiver Signature');
  }

  // 5 & 6. Educational proofs (if child is enrolled in school)
  const isOutOfSchool =
    schoolTypeStr.toLowerCase().includes('out of school') ||
    schoolTypeStr.toLowerCase().includes('not in school') ||
    schoolTypeStr.toLowerCase().includes('dropped out') ||
    schoolTypeStr.toLowerCase().includes('never enrolled');

  if (!isOutOfSchool) {
    const feeReceipt =
      it['64\nSchool Fee Receipt Link'] ||
      it['64\\nSchool Fee Receipt Link'] ||
      it['School Fee Receipt Link'] ||
      it['school fee receipt link'] ||
      it.feeReceiptPhotoUrl ||
      it.fee_receipt_photo_url ||
      it.educationExpenses?.feeReceiptPhotoUrl ||
      it.raw_payload?.educationExpenses?.feeReceiptPhotoUrl;
    if (isFieldPresent(feeReceipt)) {
      uploadedDocs.push('School Fee Receipt');
    } else {
      pendingDocs.push('School Fee Receipt');
    }

    const marksheet =
      it['65\nMarksheet Photo Link'] ||
      it['65\\nMarksheet Photo Link'] ||
      it['Marksheet Photo Link'] ||
      it['marksheet photo link'] ||
      it.marksheetPhotoUrl ||
      it.marksheet_photo_url ||
      it.educationExpenses?.marksheetPhotoUrl ||
      it.raw_payload?.educationExpenses?.marksheetPhotoUrl;
    if (isFieldPresent(marksheet)) {
      uploadedDocs.push('Academic Marksheet');
    } else {
      pendingDocs.push('Academic Marksheet');
    }
  }

  const totalRequired = uploadedDocs.length + pendingDocs.length;
  const isComplete = pendingDocs.length === 0;

  return {
    isComplete,
    totalRequired,
    uploadedCount: uploadedDocs.length,
    pendingDocs,
    uploadedDocs,
  };
}

export function parseBeneficiaryRecord(it: any): SupervisorBeneficiaryRow {
  const rawBmi = it['34\nBMI'] ?? it['bmi'] ?? it.nutrition?.bmi ?? it.clinical?.bmi ?? 0;
  let bmiCat: BMICategory = 'Normal';
  const numBmi = Number(rawBmi) || 0;
  if (numBmi > 0) {
    if (numBmi < 13.5) bmiCat = 'Severe Underweight';
    else if (numBmi < 15.0) bmiCat = 'Moderate Underweight';
    else if (numBmi > 22.0) bmiCat = 'Overweight / Obese';
  }

  const rawVl = it['45\nViral Load'] ?? it['viral load'] ?? it.clinical?.viralLoad ?? it.clinical?.viralload ?? it.viralload ?? '';
  const numVl = parseFloat(String(rawVl).replace(/[^0-9.]/g, ''));
  let vlCat: VLCategory = 'Unknown / Pending';
  if (String(rawVl).toLowerCase().includes('undetect') || String(rawVl).includes('<50') || String(rawVl).includes('< 50') || numVl < 50) {
    vlCat = 'Undetectable (<50 copies/mL)';
  } else if (!isNaN(numVl)) {
    if (numVl < 1000) vlCat = 'Suppressed (<1000 copies/mL)';
    else vlCat = 'Unsuppressed (≥1000 copies/mL)';
  }

  const rawHb = it['36\nHemoglobin (g/dL)'] ?? it['hemoglobin (g/dl)'] ?? it.clinical?.hemoglobin ?? it.clinical?.haemoglobin ?? it.hemoglobin ?? '';
  const numHb = parseFloat(String(rawHb));
  let hbCat: HbCategory = 'Normal';
  if (!isNaN(numHb) && numHb > 0) {
    if (numHb < 7.0) hbCat = 'Severe Anemia';
    else if (numHb < 10.0) hbCat = 'Moderate Anemia';
    else if (numHb < 11.0) hbCat = 'Mild Anemia';
  }

  const id = it['1\nUnique ID'] || it['unique id'] || it.id || it._uuid || it.client_submission_id || it.remote_submission_id || it.clientSubmissionId;
  const artNumber = it['42\nART ID Number'] || it['art id number'] || it['1\nUnique ID'] || it.demographics?.artNumber || it.art_number || id || 'MH-BEN-00';
  const childName = it['9\nChild Name'] || it['child name'] || it.demographics?.childName || it.child_name || 'Beneficiary Child';
  const age = Number(it['11\nAge'] ?? it['age'] ?? it.demographics?.calculatedAgeYears ?? it.calculated_age ?? 0);
  const gender = it['12\nGender'] || it['gender'] || it.demographics?.gender || it.gender || '—';
  const district = it['19\nDistrict'] || it['district'] || it.demographics?.district || it.district || 'General';
  const state = it['18\nState'] || it['state'] || it.demographics?.state || it.state || 'Maharashtra';
  const schoolType = it['53\nSchool Type'] || it['school type'] || it.educationStatus?.schoolType || it.education?.schoolType || it.school_type || 'Government school';
  const schoolEnrolled = it['49\nEducation Status']
    ? !String(it['49\nEducation Status']).toLowerCase().includes('not')
    : (it.education?.educationStatus?.includes('going') ?? it.school_enrolled ?? true);
  const orphanStatus = it['13\nOrphan Status'] || it['orphan status'] || it.demographics?.orphanStatus || it.orphan_status || 'Both parents alive';
  const grantAmount = Number(it['63\nTotal Annual Education Cost'] ?? it['total annual education cost'] ?? it.grantCalculation?.totalGrantAmount ?? it.recommended_grant_amount ?? it.educationExpenses?.totalRequiredSupport ?? 0);
  const lastVisit = (it['7\nVisit Date'] || it['visit date'] || it['73\nLast Updated'] || it['3\nSubmission Time'] || it.updatedAt || it.createdAt || new Date().toISOString()).split('T')[0];
  const version = Number(it['2\nRevision Number'] ?? it['revision number'] ?? it.version ?? 1);
  const documentStatus = evaluateDocuments(it, schoolType);

  const rawApproved =
    it['67\nApproved Alliance India'] ||
    it['67\\nApproved Alliance India'] ||
    it['Approved Alliance India'] ||
    it['approved alliance india'] ||
    it.approvedAllianceIndia ||
    it.approved_alliance_india ||
    it.finalReview?.approvedAllianceIndia ||
    it.raw_payload?.finalReview?.approvedAllianceIndia;

  const isApproved =
    typeof rawApproved === 'boolean'
      ? rawApproved
      : String(rawApproved || '').toLowerCase().includes('approv') ||
        String(rawApproved || '').toLowerCase() === 'yes';

  const approvedStatus = isApproved ? 'Approved' : String(rawApproved || 'Pending');

  return {
    id: String(id),
    artNumber: String(artNumber),
    childName: String(childName),
    age,
    gender: String(gender),
    district: String(district),
    state: String(state),
    schoolType: String(schoolType),
    schoolEnrolled: Boolean(schoolEnrolled),
    orphanStatus: String(orphanStatus),
    bmi: numBmi,
    bmiCategory: (it['35\nBMI Category'] || it['bmi category'] || it.clinical?.bmiCategory || it.bmicategory || bmiCat) as BMICategory,
    viralLoad: String(rawVl || '—'),
    vlCategory: (it['46\nVL Category'] || it['vl category'] || it.clinical?.vlCategory || it.vl_category || vlCat) as VLCategory,
    hemoglobin: String(rawHb || '—'),
    hbCategory: (it['37\nHb Category'] || it['hb category'] || it.clinical?.hbCategory || it.hb_category || hbCat) as HbCategory,
    grantAmount,
    syncState: 'SYNCED',
    lastVisit,
    version,
    documentStatus,
    isApproved,
    approvedStatus,
  };
}

export function useSupervisorData(options?: { autoFetch?: boolean }): SupervisorDataHook {
  const [status, setStatus] = useState<SupervisorDataStatus>('idle');
  const [records, setRecords] = useState<SupervisorBeneficiaryRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error, setError] = useState<SupervisorDataError | null>(null);

  const fetchRecords = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      // Force bypass of any intermediate cache
      const res = await fetch('/api/submissions?limit=100', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store',
          Pragma: 'no-cache',
        },
      });

      if (!res.ok) {
        let errCode = 'UPSTREAM_UNAVAILABLE';
        let errMsg = 'Records could not be loaded. Check connection and try again.';
        let retryable = true;

        try {
          const errBody = await res.json();
          if (errBody && typeof errBody === 'object') {
            if (errBody.code) errCode = errBody.code;
            if (errBody.message) errMsg = errBody.message;
            if (typeof errBody.retryable === 'boolean') retryable = errBody.retryable;
          }
        } catch {
          // Non-JSON upstream error (e.g. 502 HTML from gateway)
          errMsg = `Gateway returned HTTP ${res.status}: ${res.statusText}`;
        }

        setError({ code: errCode, message: errMsg, retryable });
        setStatus('error');
        setRecords([]);
        setTotal(0);
        return;
      }

      const json = await res.json();

      // Standard contract: json.data.records; fallback: json.data (array) or json.items
      let rawItems: any[] = [];
      if (json.data && Array.isArray(json.data.records)) {
        rawItems = json.data.records;
      } else if (Array.isArray(json.data)) {
        rawItems = json.data;
      } else if (Array.isArray(json.items)) {
        rawItems = json.items;
      }

      const reportedTotal = json.data?.total ?? json.pagination?.totalCount ?? rawItems.length;

      if (rawItems.length === 0) {
        setRecords([]);
        setTotal(reportedTotal);
        setStatus('empty');
        setLastRefreshed(new Date());
        setError(null);
        return;
      }

      const mapped = rawItems.map(parseBeneficiaryRecord);
      setRecords(mapped);
      setTotal(reportedTotal > 0 ? reportedTotal : mapped.length);
      setStatus('success');
      setLastRefreshed(new Date());
      setError(null);
    } catch (networkErr: any) {
      console.error('useSupervisorData network error:', networkErr);
      setError({
        code: 'NETWORK_ERROR',
        message: 'Unable to connect to records server. Check your connection and try again.',
        retryable: true,
      });
      setStatus('error');
      setRecords([]);
      setTotal(0);
    }
  }, []);

  useEffect(() => {
    if (options?.autoFetch !== false) {
      fetchRecords();
    }
  }, [fetchRecords, options?.autoFetch]);

  return {
    status,
    records,
    total,
    lastRefreshed,
    error,
    refresh: fetchRecords,
    retry: fetchRecords,
    setRecords,
    isLoading: status === 'loading',
    isError: status === 'error',
    isEmpty: status === 'empty',
  };
}
