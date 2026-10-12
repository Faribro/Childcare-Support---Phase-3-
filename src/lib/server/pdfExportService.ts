/**
 * PDF Export Service for Childcare Support Phase 3
 * Generates standards-compliant, zero-dependency PDF 1.4 documents
 * for authorized beneficiary record exports.
 */

function escapePdfString(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' '); // Replace non-ASCII printable chars with space
}

interface PdfTextCommand {
  text: string;
  x: number;
  y: number;
  fontSize?: number;
  bold?: boolean;
}

export function generateBeneficiaryPdfBuffer(record: any): Buffer {
  const d = record.demographics || {};
  const c = record.clinical || {};
  const e = record.education || record.educationStatus || {};
  const g = record.grantCalculation || record.educationExpenses || {};
  const r = record.finalReview || {};

  const id = String(record.id || record.uniqueId || record['1\nUnique ID'] || 'BEN-UNKNOWN');
  const childName = String(d.childName || record['9\nChild Name'] || record.childName || 'Beneficiary');
  const artNumber = String(d.artNumber || record['42\nART ID Number'] || record.artNumber || 'N/A');
  const age = String(d.calculatedAgeYears ?? record['11\nAge'] ?? record.age ?? 'N/A');
  const gender = String(d.gender || record['12\nGender'] || record.gender || 'N/A');
  const state = String(d.state || record['18\nState'] || record.state || 'Maharashtra');
  const district = String(d.district || record['19\nDistrict'] || record.district || 'General');
  const orphanStatus = String(d.orphanStatus || record['13\nOrphan Status'] || record.orphanStatus || 'N/A');
  const caregiverName = String(d.caregiverName || record['14\nCaregiver Name'] || 'N/A');

  const bmi = String(c.bmi ?? record['34\nBMI'] ?? record.bmi ?? 'N/A');
  const bmiCategory = String(c.bmiCategory || record['35\nBMI Category'] || record.bmiCategory || 'N/A');
  const viralLoad = String(c.viralLoadCopies || record['45\nViral Load Copies'] || record.viralLoad || 'N/A');
  const vlCategory = String(c.vlCategory || record['46\nVL Category'] || record.vlCategory || 'N/A');
  const hemoglobin = String(c.hemoglobinLevel || record['36\nHaemoglobin Level'] || record.hemoglobin || 'N/A');
  const hbCategory = String(c.hbCategory || record['37\nHb Category'] || record.hbCategory || 'N/A');

  const schoolType = String(e.schoolType || record['53\nSchool Type'] || record.schoolType || 'N/A');
  const currentClass = String(e.currentClass || record['52\nCurrent Class'] || 'N/A');
  const totalGrant = String(g.totalGrantAmount ?? record['63\nTotal Annual Education Cost'] ?? record.grantAmount ?? '0');
  const approvalStatus = String(r.approvedAllianceIndia ? 'APPROVED' : (record.isApproved ? 'APPROVED' : 'PENDING'));
  const exportDate = new Date().toISOString().split('T')[0];

  // Canvas height 792 (Letter height), top margin at 740, bottom at 50
  const commands: PdfTextCommand[] = [
    // Header
    { text: 'INDIA HIV/AIDS ALLIANCE', x: 50, y: 740, fontSize: 16, bold: true },
    { text: 'CHILD NUTRITION & EDUCATION SUPPORT PROGRAMME', x: 50, y: 722, fontSize: 12, bold: true },
    { text: 'CONFIDENTIAL CLINICAL & WELFARE ASSESSMENT DOSSIER', x: 50, y: 706, fontSize: 10, bold: false },
    { text: `Export Date: ${exportDate}   |   Record ID: ${id}`, x: 50, y: 690, fontSize: 9, bold: false },

    // Section 1: Demographics
    { text: '1. BENEFICIARY DEMOGRAPHICS', x: 50, y: 660, fontSize: 11, bold: true },
    { text: `Child Name:      ${childName}`, x: 60, y: 642, fontSize: 9 },
    { text: `ART ID Number:   ${artNumber}`, x: 320, y: 642, fontSize: 9 },
    { text: `Age / Gender:    ${age} Years / ${gender}`, x: 60, y: 626, fontSize: 9 },
    { text: `Orphan Status:   ${orphanStatus}`, x: 320, y: 626, fontSize: 9 },
    { text: `State / District: ${state} / ${district}`, x: 60, y: 610, fontSize: 9 },
    { text: `Caregiver Name:  ${caregiverName}`, x: 320, y: 610, fontSize: 9 },

    // Section 2: Clinical Assessment
    { text: '2. CLINICAL & NUTRITIONAL PROFILE', x: 50, y: 580, fontSize: 11, bold: true },
    { text: `BMI:             ${bmi} (${bmiCategory})`, x: 60, y: 562, fontSize: 9 },
    { text: `Viral Load:      ${viralLoad} copies/mL (${vlCategory})`, x: 320, y: 562, fontSize: 9 },
    { text: `Haemoglobin:     ${hemoglobin} g/dL (${hbCategory})`, x: 60, y: 546, fontSize: 9 },

    // Section 3: Education & Entitlement
    { text: '3. EDUCATION STATUS & GRANT ENTITLEMENT', x: 50, y: 516, fontSize: 11, bold: true },
    { text: `School Type:     ${schoolType}`, x: 60, y: 498, fontSize: 9 },
    { text: `Current Class:   ${currentClass}`, x: 320, y: 498, fontSize: 9 },
    { text: `Grant Amount:    INR ${totalGrant}`, x: 60, y: 482, fontSize: 9, bold: true },
    { text: `Alliance Review: ${approvalStatus}`, x: 320, y: 482, fontSize: 9, bold: true },

    // Section 4: Confidentiality Notice
    { text: '4. CONFIDENTIALITY NOTICE', x: 50, y: 440, fontSize: 11, bold: true },
    { text: 'Confidential - contains personal and programme information.', x: 60, y: 422, fontSize: 8 },
    { text: 'For authorized internal use only. Do not forward or distribute.', x: 60, y: 410, fontSize: 8 },
    { text: 'Unauthorized disclosure, copying, or dissemination is strictly prohibited.', x: 60, y: 398, fontSize: 8 },

    // Footer signature line
    { text: 'Authorized Reviewer Signature: _______________________      Date: ______________', x: 60, y: 340, fontSize: 9, bold: true },
  ];

  // Generate content stream operations
  const streamLines: string[] = [];

  // Header accent bar
  streamLines.push('0.06 0.46 0.44 rg'); // Teal color
  streamLines.push('50 680 512 2 re f'); // Horizontal line

  // Section dividing lines
  streamLines.push('0.85 0.88 0.90 rg'); // Slate light gray
  streamLines.push('50 595 512 1 re f');
  streamLines.push('50 530 512 1 re f');
  streamLines.push('50 455 512 1 re f');
  streamLines.push('50 365 512 1 re f');

  // Text commands
  streamLines.push('0 0 0 rg'); // Black text default
  for (const cmd of commands) {
    const fontName = cmd.bold ? '/F2' : '/F1';
    const size = cmd.fontSize || 10;
    streamLines.push('BT');
    streamLines.push(`${fontName} ${size} Tf`);
    streamLines.push(`${cmd.x} ${cmd.y} Td`);
    streamLines.push(`(${escapePdfString(cmd.text)}) Tj`);
    streamLines.push('ET');
  }

  const contentStream = streamLines.join('\n');
  const streamLength = Buffer.byteLength(contentStream, 'utf-8');

  // Construct PDF Objects
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n';
  const obj4 = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  const obj5 = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';
  const obj6 = `6 0 obj\n<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`;

  const header = '%PDF-1.4\n';

  // Compute byte offsets for cross-reference table
  let currentOffset = Buffer.byteLength(header, 'utf-8');
  const offset1 = currentOffset;
  currentOffset += Buffer.byteLength(obj1, 'utf-8');
  const offset2 = currentOffset;
  currentOffset += Buffer.byteLength(obj2, 'utf-8');
  const offset3 = currentOffset;
  currentOffset += Buffer.byteLength(obj3, 'utf-8');
  const offset4 = currentOffset;
  currentOffset += Buffer.byteLength(obj4, 'utf-8');
  const offset5 = currentOffset;
  currentOffset += Buffer.byteLength(obj5, 'utf-8');
  const offset6 = currentOffset;
  currentOffset += Buffer.byteLength(obj6, 'utf-8');

  const startXref = currentOffset;

  const pad = (n: number) => String(n).padStart(10, '0');

  const xref =
    `xref\n` +
    `0 7\n` +
    `0000000000 65535 f \n` +
    `${pad(offset1)} 00000 n \n` +
    `${pad(offset2)} 00000 n \n` +
    `${pad(offset3)} 00000 n \n` +
    `${pad(offset4)} 00000 n \n` +
    `${pad(offset5)} 00000 n \n` +
    `${pad(offset6)} 00000 n \n`;

  const trailer =
    `trailer\n` +
    `<< /Size 7 /Root 1 0 R >>\n` +
    `startxref\n` +
    `${startXref}\n` +
    `%%EOF\n`;

  const fullPdfString = header + obj1 + obj2 + obj3 + obj4 + obj5 + obj6 + xref + trailer;
  return Buffer.from(fullPdfString, 'utf-8');
}
