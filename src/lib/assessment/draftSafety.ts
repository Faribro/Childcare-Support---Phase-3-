/**
 * draftSafety.ts
 *
 * Implements strict rules for draft creation and exit navigation:
 * - A form should NEVER silently create a draft merely because the user navigates away.
 * - Meaningful data check prevents empty or untouched forms from cluttering drafts.
 */

export function hasMeaningfulAssessmentData(
  formData: Record<string, any> | undefined | null,
  hasSavedSignature = false
): boolean {
  if (!formData || typeof formData !== 'object') return false;
  if (hasSavedSignature) return true;

  // Non-empty child identification
  if (formData.childName && String(formData.childName).trim().length > 0) return true;
  if (formData.caregiverName && String(formData.caregiverName).trim().length > 0) return true;
  if (formData.dob && String(formData.dob).trim().length > 0) return true;
  if (formData.contactNumber && String(formData.contactNumber).trim().length > 0) return true;
  if (formData.alternateContactNumber && String(formData.alternateContactNumber).trim().length > 0) return true;

  // Non-empty address details
  if (formData.doorAndColony && String(formData.doorAndColony).trim().length > 0) return true;
  if (formData.street && String(formData.street).trim().length > 0) return true;
  if (formData.villageCity && String(formData.villageCity).trim().length > 0) return true;
  if (formData.talukMandalBlock && String(formData.talukMandalBlock).trim().length > 0) return true;
  if (formData.landmark && String(formData.landmark).trim().length > 0) return true;
  if (formData.pinCode && String(formData.pinCode).trim().length > 0) return true;

  // Non-empty banking details
  if (formData.bankAccountHolderName && String(formData.bankAccountHolderName).trim().length > 0) return true;
  if (formData.bankAccountNumber && String(formData.bankAccountNumber).trim().length > 0) return true;
  if (formData.bankIfscCode && String(formData.bankIfscCode).trim().length > 0) return true;
  if (formData.childAadhaarNumber && String(formData.childAadhaarNumber).trim().length > 0) return true;

  // Clinical / anthropometrics
  if (formData.weightKg !== '' && formData.weightKg !== 0 && formData.weightKg !== undefined && formData.weightKg !== null) return true;
  if (formData.heightCm !== '' && formData.heightCm !== 0 && formData.heightCm !== undefined && formData.heightCm !== null) return true;
  if (formData.haemoglobinGdl && String(formData.haemoglobinGdl).trim().length > 0) return true;
  if (formData.artIdNumber && String(formData.artIdNumber).trim().length > 0) return true;

  // Education & expenses
  if (formData.schoolName && String(formData.schoolName).trim().length > 0) return true;
  if (Number(formData.schoolFees) > 0 || Number(formData.tuitionFees) > 0 || Number(formData.books) > 0) return true;

  // Photos & attachments
  if (formData.passbookPhotoUrl && String(formData.passbookPhotoUrl).trim().length > 0) return true;
  if (formData.aadhaarCardPhotoUrl && String(formData.aadhaarCardPhotoUrl).trim().length > 0) return true;
  if (formData.childPhotoUrl && String(formData.childPhotoUrl).trim().length > 0) return true;
  if (formData.feeReceiptPhotoUrl && String(formData.feeReceiptPhotoUrl).trim().length > 0) return true;
  if (formData.marksheetPhotoUrl && String(formData.marksheetPhotoUrl).trim().length > 0) return true;

  return false;
}
