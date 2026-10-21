import zlib from 'zlib';
import crypto from 'crypto';
import { DateBasis } from './types';

export interface LinelistExportRow {
  readonly childId: string;
  readonly childNameMasked: string;
  readonly state: string;
  readonly district: string;
  readonly ageMonths: number;
  readonly gender: 'M' | 'F';
  readonly orphanStatus: string;
  readonly schoolType: string;
  readonly visitDate: string;
  readonly submissionDate: string;
  readonly verificationStatus: string;
  readonly signatureDriveUrl?: string | null;
  readonly passbookDriveUrl?: string | null;
  readonly aadhaarDriveUrl?: string | null;
  readonly childPhotoDriveUrl?: string | null;
  readonly feeReceiptDriveUrl?: string | null;
  readonly marksheetDriveUrl?: string | null;
}

export interface LinelistExcelOptions {
  readonly title: string;
  readonly year: number;
  readonly monthOrRange: string; // e.g. "April-June" or "June"
  readonly dateBasis: DateBasis;
  readonly stateFilter: string | null;
  readonly generatedByMasked: string; // e.g. "director@allianceindia.org"
  readonly isSynthetic?: boolean;
}

export interface GeneratedExcelArtifact {
  readonly buffer: Buffer;
  readonly filename: string;
  readonly mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  readonly byteSize: number;
  readonly sha256: string;
  readonly rowCount: number;
  readonly driveLinksCount: number;
}

/**
 * Helper to compute CRC-32 checksum for standard ZIP archive entries.
 */
function crc32(buf: Buffer): number {
  let table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

interface ZipFileEntry {
  name: string;
  content: string | Buffer;
}

/**
 * Creates a valid, uncorrupted ZIP file in memory adhering to PKZIP 2.0 specification.
 * Fully compatible with Microsoft Excel, LibreOffice, Google Sheets, and openpyxl.
 */
function createZipArchive(files: readonly ZipFileEntry[]): Buffer {
  const fileRecords: Array<{
    name: string;
    nameBuf: Buffer;
    localHeader: Buffer;
    compressed: Buffer;
    crc: number;
    uncompressedLen: number;
    compressedLen: number;
    offset: number;
  }> = [];

  let offset = 0;

  for (const f of files) {
    const uncompressed = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8');
    const crc = crc32(uncompressed);
    const compressed = zlib.deflateRawSync(uncompressed);
    const nameBuf = Buffer.from(f.name, 'utf8');

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(8, 8); // Compression method: Deflate
    localHeader.writeUInt16LE(0, 10); // Last mod file time
    localHeader.writeUInt16LE(0, 12); // Last mod file date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressed.length, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressed.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    nameBuf.copy(localHeader, 30);

    fileRecords.push({
      name: f.name,
      nameBuf,
      localHeader,
      compressed,
      crc,
      uncompressedLen: uncompressed.length,
      compressedLen: compressed.length,
      offset,
    });

    offset += localHeader.length + compressed.length;
  }

  const centralDirRecords: Buffer[] = [];
  let centralDirSize = 0;

  for (const r of fileRecords) {
    const cdHeader = Buffer.alloc(46 + r.nameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Central directory header signature
    cdHeader.writeUInt16LE(20, 4); // Version made by
    cdHeader.writeUInt16LE(20, 6); // Version needed to extract
    cdHeader.writeUInt16LE(0, 8); // General purpose bit flag
    cdHeader.writeUInt16LE(8, 10); // Compression method: Deflate
    cdHeader.writeUInt16LE(0, 12); // Last mod file time
    cdHeader.writeUInt16LE(0, 14); // Last mod file date
    cdHeader.writeUInt32LE(r.crc, 16); // CRC-32
    cdHeader.writeUInt32LE(r.compressedLen, 20); // Compressed size
    cdHeader.writeUInt32LE(r.uncompressedLen, 24); // Uncompressed size
    cdHeader.writeUInt16LE(r.nameBuf.length, 28); // Filename length
    cdHeader.writeUInt16LE(0, 30); // Extra field length
    cdHeader.writeUInt16LE(0, 32); // File comment length
    cdHeader.writeUInt16LE(0, 34); // Disk number start
    cdHeader.writeUInt16LE(0, 36); // Internal file attributes
    cdHeader.writeUInt32LE(0, 38); // External file attributes
    cdHeader.writeUInt32LE(r.offset, 42); // Relative offset of local header
    r.nameBuf.copy(cdHeader, 46);

    centralDirRecords.push(cdHeader);
    centralDirSize += cdHeader.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Number of the disk with start of central directory
  eocd.writeUInt16LE(fileRecords.length, 8); // Total entries on this disk
  eocd.writeUInt16LE(fileRecords.length, 10); // Total entries in central directory
  eocd.writeUInt32LE(centralDirSize, 12); // Size of the central directory
  eocd.writeUInt32LE(offset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // ZIP file comment length

  const chunks: Buffer[] = [];
  for (const r of fileRecords) {
    chunks.push(r.localHeader, r.compressed);
  }
  for (const cd of centralDirRecords) {
    chunks.push(cd);
  }
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds standard column reference from zero-based index (0 -> A, 25 -> Z, 26 -> AA).
 */
function getColumnRef(index: number): string {
  let ref = '';
  let temp = index;
  while (temp >= 0) {
    ref = String.fromCharCode((temp % 26) + 65) + ref;
    temp = Math.floor(temp / 26) - 1;
  }
  return ref;
}

/**
 * Pure TypeScript OpenXML Excel Linelist Generator
 */
export class LinelistExcelGenerator {
  /**
   * Generates a fully formatted .xlsx workbook from linelist records and options.
   */
  public generateWorkbook(
    rows: readonly LinelistExportRow[],
    options: LinelistExcelOptions
  ): GeneratedExcelArtifact {
    const safeScope = options.stateFilter || 'National';
    const filenameSafeMonth = options.monthOrRange.replace(/\s+/g, '_');
    const filename = `Childcare_Linelist_${filenameSafeMonth}_${options.year}_${safeScope}.xlsx`;

    let totalDriveLinks = 0;

    // Define column headers
    const columns: Array<{ header: string; width: number }> = [
      { header: 'Child ID', width: 16 },
      { header: 'Child Name', width: 22 },
      { header: 'State', width: 16 },
      { header: 'District', width: 18 },
      { header: 'Age (Mos)', width: 12 },
      { header: 'Gender', width: 10 },
      { header: 'Orphan Category', width: 20 },
      { header: 'School Category', width: 22 },
      { header: 'Visit Date', width: 14 },
      { header: 'Submission Date', width: 16 },
      { header: 'Approval Status', width: 16 },
      { header: 'Signature Link', width: 22 },
      { header: 'Passbook Link', width: 22 },
      { header: 'Aadhaar Link', width: 22 },
      { header: 'Child Photo Link', width: 22 },
      { header: 'Fee Receipt Link', width: 22 },
      { header: 'Marksheet Link', width: 22 },
    ];

    // Build worksheet XML
    let sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
    sheetXml += `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n`;
    sheetXml += `  <sheetViews>\n`;
    sheetXml += `    <sheetView tabSelected="1" workbookViewId="0">\n`;
    sheetXml += `      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>\n`;
    sheetXml += `    </sheetView>\n`;
    sheetXml += `  </sheetViews>\n`;

    // Column widths
    sheetXml += `  <cols>\n`;
    columns.forEach((col, idx) => {
      sheetXml += `    <col min="${idx + 1}" max="${idx + 1}" width="${col.width}" customWidth="1"/>\n`;
    });
    sheetXml += `  </cols>\n`;

    // Sheet data
    sheetXml += `  <sheetData>\n`;

    // Header Row (Row 1)
    sheetXml += `    <row r="1" customHeight="1" ht="26">\n`;
    columns.forEach((col, idx) => {
      const colRef = `${getColumnRef(idx)}1`;
      sheetXml += `      <c r="${colRef}" s="1" t="inlineStr"><is><t>${escapeXml(col.header)}</t></is></c>\n`;
    });
    sheetXml += `    </row>\n`;

    // Data Rows (Row 2 .. N+1)
    rows.forEach((row, rIdx) => {
      const rowNum = rIdx + 2;
      sheetXml += `    <row r="${rowNum}" customHeight="1" ht="20">\n`;

      const values: Array<{ val: string; isFormula?: boolean; isLink?: boolean }> = [
        { val: row.childId },
        { val: row.childNameMasked },
        { val: row.state },
        { val: row.district },
        { val: String(row.ageMonths) },
        { val: row.gender },
        { val: row.orphanStatus },
        { val: row.schoolType },
        { val: row.visitDate },
        { val: row.submissionDate },
        { val: row.verificationStatus },
        this.formatDriveLinkCell(row.signatureDriveUrl, 'View Signature'),
        this.formatDriveLinkCell(row.passbookDriveUrl, 'View Passbook'),
        this.formatDriveLinkCell(row.aadhaarDriveUrl, 'View Aadhaar'),
        this.formatDriveLinkCell(row.childPhotoDriveUrl, 'View Photo'),
        this.formatDriveLinkCell(row.feeReceiptDriveUrl, 'View Fee Receipt'),
        this.formatDriveLinkCell(row.marksheetDriveUrl, 'View Marksheet'),
      ];

      values.forEach((v, cIdx) => {
        const cellRef = `${getColumnRef(cIdx)}${rowNum}`;
        if (v.isFormula) {
          totalDriveLinks++;
          // Formula cell with pre-evaluated label string
          const label = v.val.split('"')[3] || 'View Document';
          sheetXml += `      <c r="${cellRef}" s="3"><f>${escapeXml(v.val)}</f><v>${escapeXml(label)}</v></c>\n`;
        } else {
          sheetXml += `      <c r="${cellRef}" s="2" t="inlineStr"><is><t>${escapeXml(v.val)}</t></is></c>\n`;
        }
      });

      sheetXml += `    </row>\n`;
    });

    sheetXml += `  </sheetData>\n`;
    sheetXml += `</worksheet>`;

    // Content types
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

    // Top-level rels
    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    // Workbook rels
    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    // Workbook XML
    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Childcare Linelist" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

    // Stylesheet XML (Navy header, gray grid borders, blue link font)
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><name val="Calibri"/><sz val="10"/></font>
    <font><b/><name val="Calibri"/><sz val="11"/><color rgb="FFFFFFFF"/></font>
    <font><u/><name val="Calibri"/><sz val="10"/><color rgb="FF0563C1"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/></border>
    <border>
      <left style="thin"><color rgb="FFD9D9D9"/></left>
      <right style="thin"><color rgb="FFD9D9D9"/></right>
      <top style="thin"><color rgb="FFD9D9D9"/></top>
      <bottom style="thin"><color rgb="FFD9D9D9"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" alignment="center"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

    const archive = createZipArchive([
      { name: '[Content_Types].xml', content: contentTypesXml },
      { name: '_rels/.rels', content: relsXml },
      { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
      { name: 'xl/workbook.xml', content: workbookXml },
      { name: 'xl/styles.xml', content: stylesXml },
      { name: 'xl/worksheets/sheet1.xml', content: sheetXml },
    ]);

    const sha256 = crypto.createHash('sha256').update(archive).digest('hex');

    return {
      buffer: archive,
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      byteSize: archive.length,
      sha256,
      rowCount: rows.length,
      driveLinksCount: totalDriveLinks,
    };
  }

  private formatDriveLinkCell(
    driveUrl: string | null | undefined,
    label: string
  ): { val: string; isFormula?: boolean; isLink?: boolean } {
    if (!driveUrl || driveUrl.trim() === '') {
      return { val: 'Pending Upload', isFormula: false };
    }
    const cleanUrl = driveUrl.trim();
    return {
      val: `HYPERLINK("${cleanUrl}", "${label}")`,
      isFormula: true,
      isLink: true,
    };
  }
}
