/**
 * Full India Post Static Pincode Directory (Compressed & Lazy-Loaded)
 *
 * Maps 19,152 official 6-digit Indian PIN codes -> { postOffice, taluk, district, state }
 * backed by a compressed static asset: `public/data/india-pincodes.json.gz` (~213 KB).
 *
 * IMPORTANT DATA COVERAGE NOTES:
 * 1. Official India Post open-data directory (data.gov.in) columns are:
 *    circle_name, region_name, division_name, office_name, pincode, office_type,
 *    delivery, district, state. It does NOT have a dedicated `taluk` column.
 * 2. Our compressed directory combines current LGD-aligned State/District/Block mappings
 *    (covering Telangana, Ladakh, and newly formed districts) with India Post office names
 *    and community taluk annotations.
 * 3. Taluk values must remain editable and tagged "Please verify" in the UI when auto-filled.
 * 4. NO prefix-based district guessing: 3-digit PIN prefixes frequently span multiple districts,
 *    so only exact 6-digit matches return a PincodeRecord.
 */

export interface PincodeRecord {
  postOffice: string;
  taluk: string;
  district: string;
  state: string;
}

/** Raw compact tuple format stored inside `public/data/india-pincodes.json.gz`:
 * [postOffice, taluk, district, state] */
type CompactPincodeTuple = [string, string, string, string];
type PincodeMap = Record<string, CompactPincodeTuple>;

export const PINCODE_DIRECTORY_META = {
  assetPath: '/data/india-pincodes.json.gz',
  totalUniquePincodes: 19152,
  officialDatasetHasTalukColumn: false,
  prefixGuessingEnabled: false,
  notes:
    'Official India Post dataset lacks a dedicated taluk column; taluk comes from supplementary block/postal mappings and stays editable with a "Please verify" tag.',
} as const;

let cachedDirectory: PincodeMap | null = null;
let loadingPromise: Promise<PincodeMap> | null = null;

async function decompressGzipBufferInBrowser(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  // Check gzip magic header (0x1f, 0x8b). If CDN/proxy already transparently decompressed, decode UTF-8 directly.
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (!isGzip) {
    return new TextDecoder().decode(bytes);
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser DecompressionStream API unavailable for gzip pincode archive.');
  }

  const stream = new Response(bytes).body?.pipeThrough(new DecompressionStream('gzip'));
  if (!stream) {
    throw new Error('Failed to create gzip decompression stream.');
  }
  return await new Response(stream).text();
}

async function loadFromNodeDisk(): Promise<PincodeMap> {
  // Dynamically resolved at runtime on Node.js only so client bundles never reference Node built-ins.
  const fsMod = 'fs/promises';
  const pathMod = 'path';
  const zlibMod = 'zlib';
  const [{ readFile }, { join }, { gunzipSync }] = await Promise.all([
    import(/* webpackIgnore: true */ fsMod),
    import(/* webpackIgnore: true */ pathMod),
    import(/* webpackIgnore: true */ zlibMod),
  ]);
  const filePath = join(process.cwd(), 'public', 'data', 'india-pincodes.json.gz');
  const compressed = await readFile(filePath);
  const jsonStr = gunzipSync(compressed).toString('utf8');
  return JSON.parse(jsonStr) as PincodeMap;
}

/**
 * Lazily loads and caches the compressed India Post pincode directory in memory.
 * Concurrent calls share a single in-flight promise.
 */
export async function loadPincodeDirectory(): Promise<PincodeMap> {
  if (cachedDirectory) {
    return cachedDirectory;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async (): Promise<PincodeMap> => {
    try {
      // Server / Node / Vitest path: read directly from disk and gunzip with Node zlib
      if (typeof process !== 'undefined' && process.versions?.node && typeof window === 'undefined') {
        cachedDirectory = await loadFromNodeDisk();
        return cachedDirectory;
      }

      // Vitest / JSDOM path where window exists alongside Node process
      if (
        typeof process !== 'undefined' &&
        process.versions?.node &&
        typeof navigator !== 'undefined' &&
        /jsdom/i.test(navigator.userAgent)
      ) {
        cachedDirectory = await loadFromNodeDisk();
        return cachedDirectory;
      }

      // Browser path: lazy-fetch static compressed JSON asset
      const res = await fetch(PINCODE_DIRECTORY_META.assetPath, {
        cache: 'force-cache',
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch pincode directory (HTTP ${res.status})`);
      }
      const buffer = await res.arrayBuffer();
      const jsonStr = await decompressGzipBufferInBrowser(buffer);
      cachedDirectory = JSON.parse(jsonStr) as PincodeMap;
      return cachedDirectory;
    } catch (err) {
      loadingPromise = null;
      throw err;
    }
  })();

  return loadingPromise;
}

/**
 * Triggers non-blocking background preload of the pincode directory.
 */
export function preloadPincodeDirectory(): void {
  if (cachedDirectory || loadingPromise) return;
  loadPincodeDirectory().catch(() => {
    // Graceful silent failure: manual address entry always remains available
  });
}

function normalizePinCode(pinCode: string): string | null {
  const cleanPin = (pinCode || '').trim().replace(/\D/g, '');
  if (cleanPin.length !== 6 || cleanPin.startsWith('0')) {
    return null;
  }
  return cleanPin;
}

function tupleToRecord(tuple: CompactPincodeTuple): PincodeRecord {
  return {
    postOffice: tuple[0] || '',
    taluk: tuple[1] || '',
    district: tuple[2] || '',
    state: tuple[3] || '',
  };
}

/**
 * Exact 6-digit asynchronous pincode lookup (lazy-loads compressed directory on first call).
 * Returns null if format is invalid or PIN code is not an exact match in India Post directory.
 * Never guesses districts from 3-digit prefixes.
 */
export async function lookupPincodeAsync(pinCode: string): Promise<PincodeRecord | null> {
  const cleanPin = normalizePinCode(pinCode);
  if (!cleanPin) {
    return null;
  }

  try {
    const dir = await loadPincodeDirectory();
    const tuple = dir[cleanPin];
    return tuple ? tupleToRecord(tuple) : null;
  } catch {
    return null;
  }
}

/**
 * Synchronous lookup against already-loaded cache.
 * Returns null if cache has not finished loading yet or PIN is not an exact match.
 */
export function lookupPincode(pinCode: string): PincodeRecord | null {
  const cleanPin = normalizePinCode(pinCode);
  if (!cleanPin || !cachedDirectory) {
    return null;
  }
  const tuple = cachedDirectory[cleanPin];
  return tuple ? tupleToRecord(tuple) : null;
}

/** Exposed purely for unit tests to reset module cache state */
export function _resetPincodeDirectoryCacheForTest(): void {
  cachedDirectory = null;
  loadingPromise = null;
}
