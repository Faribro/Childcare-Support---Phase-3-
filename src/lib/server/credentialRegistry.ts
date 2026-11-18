import crypto from 'crypto';
import { hashPassword, verifyPassword } from './sessionService';
import { validateFirestoreDatabaseEnvironment } from './firestoreSubmissionAdapter';

export interface EvaluationCredential {
  id: string;
  accessIdentifier: string;
  displayName: string;
  credentialKind: 'STATE_EVALUATION' | 'LEADERSHIP_EVALUATION' | 'ADMIN';
  stateCode: string | null;
  programmeScope: string[];
  passwordHash: string;
  credentialVersion: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  rotatedAt?: string | null;
  expiresAt?: string | null;
  deliveryRef?: string | null;
  notes?: string | null;
}

export interface CanonicalStateEntry {
  code: string;
  name: string;
  accessIdentifier: string;
}

export const CANONICAL_EVALUATION_STATES: CanonicalStateEntry[] = [
  { code: 'MH', name: 'Maharashtra', accessIdentifier: 'STATE-MH' },
  { code: 'WB', name: 'West Bengal', accessIdentifier: 'STATE-WB' },
  { code: 'DL', name: 'Delhi', accessIdentifier: 'STATE-DL' },
  { code: 'KA', name: 'Karnataka', accessIdentifier: 'STATE-KA' },
  { code: 'TN', name: 'Tamil Nadu', accessIdentifier: 'STATE-TN' },
  { code: 'GJ', name: 'Gujarat', accessIdentifier: 'STATE-GJ' },
  { code: 'TG', name: 'Telangana', accessIdentifier: 'STATE-TG' },
  { code: 'UP', name: 'Uttar Pradesh', accessIdentifier: 'STATE-UP' },
];

export const LEADERSHIP_ACCESS_IDENTIFIER = 'LEADERSHIP-ALL';
export const ADMIN_ACCESS_IDENTIFIER = 'ADMIN-SYSTEM';

export const EVALUATION_CREDENTIALS_COLLECTION = 'evaluation_credentials';
export const AUTH_ATTEMPTS_COLLECTION = 'auth_attempts';

/**
 * Sliding window rate limiter configuration for authentication attempts.
 * Prevents brute force guessing without permanent account lockout.
 */
interface RateLimitWindow {
  attempts: number[];
  lockoutUntil: number | null;
}

const credentialAttempts = new Map<string, RateLimitWindow>();
const ipAttempts = new Map<string, RateLimitWindow>();

const ATTEMPT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS_PER_CREDENTIAL = 5;
const MAX_ATTEMPTS_PER_IP = 20;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// In-memory testing override for Firestore client
let activeFirestoreDb: any = null;

export function setFirestoreDbForTesting(mockDb: any): void {
  activeFirestoreDb = mockDb;
}

export function resetFirestoreDb(): void {
  activeFirestoreDb = null;
}

/**
 * Creates an in-memory mock Firestore store supporting transactions, collections, doc gets/sets/deletes,
 * queries, and limits for isolated unit and concurrency testing without live GCP credentials.
 */
export function createMockFirestore() {
  const collections = new Map<string, Map<string, any>>();

  function getCol(name: string) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name)!;
  }

  function createQuery(col: Map<string, any>, filters: Array<{ field: string; op: string; val: any }> = [], limitVal?: number) {
    return {
      where(field: string, op: string, val: any) {
        return createQuery(col, [...filters, { field, op, val }], limitVal);
      },
      orderBy(_field: string, _direction?: 'asc' | 'desc') {
        return createQuery(col, filters, limitVal);
      },
      limit(n: number) {
        return createQuery(col, filters, n);
      },
      async get() {
        const matching: any[] = [];
        for (const [id, d] of col.entries()) {
          let match = true;
          for (const f of filters) {
            if (f.op === '==' && d[f.field] !== f.val) {
              match = false;
              break;
            }
          }
          if (match) {
            matching.push({ id, exists: true, data: () => ({ ...d }) });
            if (limitVal !== undefined && matching.length >= limitVal) break;
          }
        }
        return {
          empty: matching.length === 0,
          docs: matching,
        };
      },
    };
  }

  return {
    collection(colName: string) {
      const col = getCol(colName);
      const q = createQuery(col);
      return {
        doc(docId: string) {
          return {
            id: docId,
            async get() {
              const data = col.get(docId);
              return {
                id: docId,
                exists: data !== undefined,
                data: () => (data ? { ...data } : undefined),
              };
            },
            async set(data: any) {
              col.set(docId, { ...data });
            },
            async update(data: any) {
              const prev = col.get(docId) || {};
              col.set(docId, { ...prev, ...data });
            },
            async delete() {
              col.delete(docId);
            },
          };
        },
        where(field: string, op: string, val: any) {
          return q.where(field, op, val);
        },
        orderBy(field: string, direction?: 'asc' | 'desc') {
          return q.orderBy(field, direction);
        },
        limit(n: number) {
          return q.limit(n);
        },
        async get() {
          return q.get();
        },
      };
    },
    async runTransaction(cb: (t: any) => Promise<any>) {
      const transaction = {
        async get(docRef: any) {
          return docRef.get();
        },
        async set(docRef: any, data: any) {
          return docRef.set(data);
        },
        async delete(docRef: any) {
          return docRef.delete();
        },
      };
      return await cb(transaction);
    },
    _clear() {
      collections.clear();
    },
  };
}

/**
 * Returns the active Firestore client.
 * Enforces FIRESTORE_DATABASE_ID environment isolation guard.
 */
export async function getFirestoreDb(customDb?: any) {
  if (customDb) return customDb;
  if (activeFirestoreDb) return activeFirestoreDb;

  const appEnv = process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development';
  const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
  validateFirestoreDatabaseEnvironment(appEnv, databaseId);

  if (process.env.NODE_ENV === 'test' && !process.env.FORCE_LIVE_FIRESTORE) {
    activeFirestoreDb = createMockFirestore();
    return activeFirestoreDb;
  }

  const firestoreMod = await import('@google-cloud/firestore');
  const FirestoreClass =
    (firestoreMod as any).Firestore ||
    (firestoreMod as any).default ||
    firestoreMod;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'cs-p3-production';
  activeFirestoreDb = new FirestoreClass({
    projectId,
    databaseId: databaseId === '(default)' ? undefined : databaseId,
    ignoreUndefinedProperties: true,
  });
  return activeFirestoreDb;
}

export function resetRateLimits(): void {
  credentialAttempts.clear();
  ipAttempts.clear();
  if (activeFirestoreDb && typeof activeFirestoreDb._clear === 'function') {
    activeFirestoreDb._clear();
  }
}

function sanitizeDocKey(s: string): string {
  return s.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
}

export function sanitizeIpForDocId(ip: string): string {
  if (!ip || typeof ip !== 'string') return 'unknown';
  const cleaned = ip
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'unknown';
}

export function getAuthAttemptCredDocId(identifier: string, ip: string): string {
  return `cred_${sanitizeDocKey(identifier)}_${sanitizeIpForDocId(ip)}`;
}

export function getAuthAttemptIpDocId(ip: string): string {
  return `ip_${sanitizeIpForDocId(ip)}`;
}

/**
 * In-memory sliding window rate limit check.
 */
export function checkRateLimitInMemory(
  identifier: string,
  ip: string
): { allowed: boolean; retryAfterSeconds?: number; reason?: string } {
  const now = Date.now();
  const credKey = `${identifier.trim().toUpperCase()}:${ip.trim()}`;
  const ipKey = ip.trim();

  // 1. Check credential + IP window
  const credWindow = credentialAttempts.get(credKey);
  if (credWindow?.lockoutUntil && now < credWindow.lockoutUntil) {
    const retryAfterSeconds = Math.ceil((credWindow.lockoutUntil - now) / 1000);
    return {
      allowed: false,
      retryAfterSeconds,
      reason: `Too many failed attempts for this access identifier. Access is temporarily locked. Please wait ${Math.ceil(
        retryAfterSeconds / 60
      )} minute(s) before retrying.`,
    };
  }

  // 2. Check source IP global window
  const ipWindow = ipAttempts.get(ipKey);
  if (ipWindow?.lockoutUntil && now < ipWindow.lockoutUntil) {
    const retryAfterSeconds = Math.ceil((ipWindow.lockoutUntil - now) / 1000);
    return {
      allowed: false,
      retryAfterSeconds,
      reason: `Too many attempts from your network. Access is temporarily locked. Please wait ${Math.ceil(
        retryAfterSeconds / 60
      )} minute(s) before retrying.`,
    };
  }

  return { allowed: true };
}

/**
 * Firestore distributed sliding window rate limit check.
 * Evaluates shared lockout timestamps stored across Cloud Run instances in `auth_attempts`.
 */
async function checkRateLimitFirestore(
  identifier: string,
  ip: string
): Promise<{ allowed: boolean; retryAfterSeconds?: number; reason?: string }> {
  const appEnv = (process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development').toLowerCase();
  const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
  validateFirestoreDatabaseEnvironment(appEnv, databaseId);

  const now = Date.now();
  const credDocId = getAuthAttemptCredDocId(identifier, ip);
  const ipDocId = getAuthAttemptIpDocId(ip);

  try {
    const db = await getFirestoreDb();
    const [credSnap, ipSnap] = await Promise.all([
      db.collection(AUTH_ATTEMPTS_COLLECTION).doc(credDocId).get(),
      db.collection(AUTH_ATTEMPTS_COLLECTION).doc(ipDocId).get(),
    ]);

    if (credSnap.exists) {
      const data = credSnap.data();
      if (data?.lockoutUntil && now < data.lockoutUntil) {
        const retryAfterSeconds = Math.ceil((data.lockoutUntil - now) / 1000);
        return {
          allowed: false,
          retryAfterSeconds,
          reason: `Too many failed attempts for this access identifier. Access is temporarily locked. Please wait ${Math.ceil(
            retryAfterSeconds / 60
          )} minute(s) before retrying.`,
        };
      }
    }

    if (ipSnap.exists) {
      const data = ipSnap.data();
      if (data?.lockoutUntil && now < data.lockoutUntil) {
        const retryAfterSeconds = Math.ceil((data.lockoutUntil - now) / 1000);
        return {
          allowed: false,
          retryAfterSeconds,
          reason: `Too many attempts from your network. Access is temporarily locked. Please wait ${Math.ceil(
            retryAfterSeconds / 60
          )} minute(s) before retrying.`,
        };
      }
    }

    return { allowed: true };
  } catch (err: any) {
    if (err.message?.includes('CONFIGURATION_ERROR')) {
      throw err;
    }
    if (appEnv === 'production') {
      console.error('[RateLimitFirestore] Failed to check rate limits in production (failing closed):', err.message);
      const failClosedError: any = new Error('DATABASE_UNAVAILABLE');
      failClosedError.statusCode = 503;
      throw failClosedError;
    }
    console.warn('[RateLimitFirestore] Falling back to in-memory check in non-production environment:', err.message);
    return checkRateLimitInMemory(identifier, ip);
  }
}

/**
 * Universal rate limit check: chooses Firestore (when DATA_ENGINE=firestore)
 * or in-memory (when DATA_ENGINE=sheets or unset).
 */
export async function checkRateLimit(
  identifier: string,
  ip: string
): Promise<{ allowed: boolean; retryAfterSeconds?: number; reason?: string }> {
  if (process.env.DATA_ENGINE === 'firestore') {
    return checkRateLimitFirestore(identifier, ip);
  }
  return checkRateLimitInMemory(identifier, ip);
}

/**
 * In-memory failed attempt recorder.
 */
export function recordAuthAttemptInMemory(identifier: string, ip: string, success: boolean): void {
  const now = Date.now();
  const credKey = `${identifier.trim().toUpperCase()}:${ip.trim()}`;
  const ipKey = ip.trim();

  if (success) {
    credentialAttempts.delete(credKey);
    return;
  }

  let credWindow = credentialAttempts.get(credKey);
  if (!credWindow) {
    credWindow = { attempts: [], lockoutUntil: null };
    credentialAttempts.set(credKey, credWindow);
  }
  credWindow.attempts = credWindow.attempts.filter((t) => now - t < ATTEMPT_WINDOW_MS);
  credWindow.attempts.push(now);

  if (credWindow.attempts.length >= MAX_ATTEMPTS_PER_CREDENTIAL) {
    credWindow.lockoutUntil = now + LOCKOUT_DURATION_MS;
  }

  let ipWindow = ipAttempts.get(ipKey);
  if (!ipWindow) {
    ipWindow = { attempts: [], lockoutUntil: null };
    ipAttempts.set(ipKey, ipWindow);
  }
  ipWindow.attempts = ipWindow.attempts.filter((t) => now - t < ATTEMPT_WINDOW_MS);
  ipWindow.attempts.push(now);

  if (ipWindow.attempts.length >= MAX_ATTEMPTS_PER_IP) {
    ipWindow.lockoutUntil = now + LOCKOUT_DURATION_MS;
  }
}

/**
 * Firestore distributed attempt recorder using atomic transactions.
 * Sets TTL field `expiresAt` for automatic Firestore TTL pruning.
 */
async function recordAuthAttemptFirestore(
  identifier: string,
  ip: string,
  success: boolean
): Promise<void> {
  const now = Date.now();
  const credDocId = getAuthAttemptCredDocId(identifier, ip);
  const ipDocId = getAuthAttemptIpDocId(ip);

  try {
    const db = await getFirestoreDb();
    const credRef = db.collection(AUTH_ATTEMPTS_COLLECTION).doc(credDocId);
    const ipRef = db.collection(AUTH_ATTEMPTS_COLLECTION).doc(ipDocId);

    if (success) {
      await credRef.delete().catch(() => {});
      return;
    }

    await db.runTransaction(async (transaction: any) => {
      const [credSnap, ipSnap] = await Promise.all([
        transaction.get(credRef),
        transaction.get(ipRef),
      ]);

      // 1. Process Credential + IP attempt window
      const credData = credSnap.exists ? credSnap.data() : null;
      const credAttempts: number[] = (credData?.attempts || []).filter(
        (t: number) => now - t < ATTEMPT_WINDOW_MS
      );
      credAttempts.push(now);

      let credLockout: number | null = null;
      if (credAttempts.length >= MAX_ATTEMPTS_PER_CREDENTIAL) {
        credLockout = now + LOCKOUT_DURATION_MS;
      }

      const credTtlMs = Math.max(credLockout || 0, now) + LOCKOUT_DURATION_MS + 5 * 60 * 1000;
      const credTtlDate = new Date(credTtlMs);

      transaction.set(credRef, {
        key: `${identifier.trim().toUpperCase()}:${ip.trim()}`,
        type: 'credential_ip',
        attempts: credAttempts,
        attemptsCount: credAttempts.length,
        lastAttemptAt: new Date(now).toISOString(),
        lockoutUntil: credLockout,
        expiresAt: credTtlDate,
      });

      // 2. Process global IP attempt window
      const ipData = ipSnap.exists ? ipSnap.data() : null;
      const ipAttemptsList: number[] = (ipData?.attempts || []).filter(
        (t: number) => now - t < ATTEMPT_WINDOW_MS
      );
      ipAttemptsList.push(now);

      let ipLockout: number | null = null;
      if (ipAttemptsList.length >= MAX_ATTEMPTS_PER_IP) {
        ipLockout = now + LOCKOUT_DURATION_MS;
      }

      const ipTtlMs = Math.max(ipLockout || 0, now) + LOCKOUT_DURATION_MS + 5 * 60 * 1000;
      const ipTtlDate = new Date(ipTtlMs);

      transaction.set(ipRef, {
        key: ip.trim(),
        type: 'ip_global',
        attempts: ipAttemptsList,
        attemptsCount: ipAttemptsList.length,
        lastAttemptAt: new Date(now).toISOString(),
        lockoutUntil: ipLockout,
        expiresAt: ipTtlDate,
      });
    });
  } catch (err: any) {
    const appEnv = (process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development').toLowerCase();
    if (appEnv === 'production') {
      console.error('[RateLimitFirestore] Failed to record auth attempt in production:', err.message);
    } else {
      console.warn('[RateLimitFirestore] Recording attempt in-memory fallback:', err.message);
      recordAuthAttemptInMemory(identifier, ip, success);
    }
  }
}

/**
 * Universal auth attempt recorder: chooses Firestore (when DATA_ENGINE=firestore)
 * or in-memory (when DATA_ENGINE=sheets or unset).
 */
export async function recordAuthAttempt(
  identifier: string,
  ip: string,
  success: boolean
): Promise<void> {
  if (process.env.DATA_ENGINE === 'firestore') {
    return recordAuthAttemptFirestore(identifier, ip, success);
  }
  return recordAuthAttemptInMemory(identifier, ip, success);
}

/**
 * In-memory registry store for tests and initial server boot.
 * Populated with synthetic credentials and test fixtures.
 */
const inMemoryRegistry = new Map<string, EvaluationCredential>();

/**
 * Normalizes an identifier or state input to resolve matching credential record.
 */
export function resolveAccessIdentifier(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();

  // Direct match to standard identifier format
  if (upper.startsWith('STATE-')) {
    const stateMatch = CANONICAL_EVALUATION_STATES.find((s) => s.accessIdentifier === upper);
    if (stateMatch) return stateMatch.accessIdentifier;
  }

  // 2-3 letter state code (e.g. MH, WB, DL)
  const codeMatch = CANONICAL_EVALUATION_STATES.find((s) => s.code.toUpperCase() === upper);
  if (codeMatch) return codeMatch.accessIdentifier;

  // Full state name (e.g. Maharashtra, West Bengal)
  const nameMatch = CANONICAL_EVALUATION_STATES.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  if (nameMatch) return nameMatch.accessIdentifier;

  // Leadership identifier aliases
  if (
    upper === 'LEADERSHIP' ||
    upper === 'LEADERSHIP-ALL' ||
    upper === 'LEADERSHIP_INDIA' ||
    upper === 'LEAD-NAT-01'
  ) {
    return LEADERSHIP_ACCESS_IDENTIFIER;
  }

  // Admin identifier aliases
  if (upper === 'ADMIN' || upper === 'ADMIN-SYSTEM' || upper === 'ADMIN-01') {
    return ADMIN_ACCESS_IDENTIFIER;
  }

  // Check if it's already an active in-memory identifier
  for (const [id, cred] of inMemoryRegistry.entries()) {
    if (id.toUpperCase() === upper || cred.accessIdentifier.toUpperCase() === upper) {
      return cred.accessIdentifier;
    }
  }

  return null;
}

function mapFirestoreDocToCredential(data: any): EvaluationCredential {
  return {
    id: data.id || data.accessIdentifier,
    accessIdentifier: data.accessIdentifier,
    displayName: data.displayName || data.accessIdentifier,
    credentialKind: data.credentialKind || 'STATE_EVALUATION',
    stateCode: data.stateCode || null,
    programmeScope: data.programmeScope || ['alliance-childcare-phase3'],
    passwordHash: data.passwordHash,
    credentialVersion: typeof data.credentialVersion === 'number' ? data.credentialVersion : 1,
    isActive: data.isActive !== false,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
    rotatedAt: data.rotatedAt || null,
    expiresAt: data.expiresAt || null,
    deliveryRef: data.deliveryRef || null,
    notes: data.notes || null,
  };
}

/**
 * Look up a credential by identifier or state name.
 * Supports Firestore (DATA_ENGINE=firestore), falling closed with 503 on production database errors.
 */
export async function getCredentialByIdentifier(identifierOrState: string): Promise<EvaluationCredential | null> {
  const resolvedId = resolveAccessIdentifier(identifierOrState) || identifierOrState.trim();
  const isFirestore = process.env.DATA_ENGINE === 'firestore';

  // 1. Check Firestore backing if configured
  if (isFirestore) {
    const appEnv = (process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development').toLowerCase();
    const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
    validateFirestoreDatabaseEnvironment(appEnv, databaseId);

    try {
      const db = await getFirestoreDb();
      // Fast path: direct doc lookup by uppercase accessIdentifier
      const docRef = db.collection(EVALUATION_CREDENTIALS_COLLECTION).doc(resolvedId.toUpperCase());
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        if (data && data.isActive !== false) {
          return mapFirestoreDocToCredential(data);
        }
        return null;
      }

      // Query by accessIdentifier field
      const querySnap = await db
        .collection(EVALUATION_CREDENTIALS_COLLECTION)
        .where('accessIdentifier', '==', resolvedId.toUpperCase())
        .limit(1)
        .get();
      if (!querySnap.empty) {
        const data = querySnap.docs[0].data();
        if (data && data.isActive !== false) {
          return mapFirestoreDocToCredential(data);
        }
        return null;
      }

      // Query by stateCode field
      const stateSnap = await db
        .collection(EVALUATION_CREDENTIALS_COLLECTION)
        .where('stateCode', '==', identifierOrState.trim())
        .limit(1)
        .get();
      if (!stateSnap.empty) {
        const data = stateSnap.docs[0].data();
        if (data && data.isActive !== false) {
          return mapFirestoreDocToCredential(data);
        }
        return null;
      }

      // If document was not found in Firestore, do not fall through to memory in production
      if (appEnv === 'production') {
        return null;
      }
    } catch (err: any) {
      if (err.message?.includes('CONFIGURATION_ERROR')) {
        throw err;
      }
      if (appEnv === 'production') {
        console.error('[CredentialRegistry] Firestore lookup failed in production (failing closed):', err.message);
        const failClosedError: any = new Error('DATABASE_UNAVAILABLE');
        failClosedError.statusCode = 503;
        throw failClosedError;
      }
      console.warn('[CredentialRegistry] Firestore lookup error in non-prod, continuing fallback:', err.message);
    }
  }

  // Auto-initialize fixtures in test environment if empty (non-firestore or dev test)
  if (inMemoryRegistry.size === 0 && process.env.NODE_ENV === 'test' && !isFirestore) {
    await initializeTestFixtures();
  }

  // 2. Check in-memory store
  const memoryRecord = inMemoryRegistry.get(resolvedId.toUpperCase());
  if (memoryRecord) {
    return memoryRecord;
  }

  // Check by stateCode or aliases in inMemoryRegistry
  for (const cred of inMemoryRegistry.values()) {
    if (
      cred.accessIdentifier.toUpperCase() === resolvedId.toUpperCase() ||
      (cred.stateCode && cred.stateCode.toLowerCase() === identifierOrState.trim().toLowerCase())
    ) {
      return cred;
    }
  }

  // 3. Query legacy Supabase registry table via PostgREST if service-role credentials exist
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NODE_ENV !== 'test') {
    try {
      const baseUrl = supabaseUrl.replace(/\/+$/, '');
      const url = `${baseUrl}/rest/v1/evaluation_credential_registry?access_identifier=eq.${encodeURIComponent(resolvedId)}&is_active=eq.true&select=*`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        return null;
      }

      const rows: any[] = await res.json();
      const data = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

      if (data) {
        return {
          id: data.id,
          accessIdentifier: data.access_identifier,
          displayName: data.display_name,
          credentialKind: data.credential_kind,
          stateCode: data.state_code,
          programmeScope: data.programme_scope || ['alliance-childcare-phase3'],
          passwordHash: data.password_hash,
          credentialVersion: data.credential_version || 1,
          isActive: data.is_active,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          rotatedAt: data.rotated_at,
          expiresAt: data.expires_at,
          deliveryRef: data.metadata?.deliveryRef || null,
          notes: data.metadata?.notes || null,
        };
      }
    } catch (err: any) {
      console.error('[CredentialRegistry] Failed to query remote database registry:', err.message);
      return null;
    }
  }

  return null;
}

/**
 * Synchronous check for in-memory credential active state and version match.
 * Enables immediate session token invalidation upon credential rotation or deactivation.
 */
export function isCredentialActiveSync(accessIdentifier: string, expectedVersion?: number): boolean {
  const resolvedId = resolveAccessIdentifier(accessIdentifier) || accessIdentifier.trim();
  const memoryRecord = inMemoryRegistry.get(resolvedId.toUpperCase());
  if (memoryRecord) {
    if (!memoryRecord.isActive) return false;
    if (expectedVersion !== undefined && memoryRecord.credentialVersion !== expectedVersion) {
      return false;
    }
    return true;
  }
  return true;
}

/**
 * Validates that an active credential matching the given identifier and version exists.
 * Queries Firestore when DATA_ENGINE=firestore.
 */
export async function isCredentialActive(accessIdentifier: string, expectedVersion?: number): Promise<boolean> {
  const cred = await getCredentialByIdentifier(accessIdentifier);
  if (!cred || !cred.isActive) return false;
  if (expectedVersion !== undefined && cred.credentialVersion !== expectedVersion) {
    return false;
  }
  return true;
}

/**
 * Registers or updates a credential in the in-memory registry (for testing or bootstrapping).
 */
export function registerCredential(credential: EvaluationCredential): void {
  inMemoryRegistry.set(credential.accessIdentifier.toUpperCase(), credential);
}

/**
 * Writes or updates an evaluation credential in Firestore.
 */
export async function saveCredentialToFirestore(credential: EvaluationCredential, customDb?: any): Promise<void> {
  const db = customDb || (await getFirestoreDb());
  const docRef = db.collection(EVALUATION_CREDENTIALS_COLLECTION).doc(credential.accessIdentifier.toUpperCase());
  await docRef.set({
    id: credential.id,
    accessIdentifier: credential.accessIdentifier,
    displayName: credential.displayName,
    credentialKind: credential.credentialKind,
    stateCode: credential.stateCode || null,
    programmeScope: credential.programmeScope || ['alliance-childcare-phase3'],
    passwordHash: credential.passwordHash,
    credentialVersion: credential.credentialVersion || 1,
    isActive: credential.isActive !== false,
    createdAt: credential.createdAt || new Date().toISOString(),
    updatedAt: credential.updatedAt || new Date().toISOString(),
    rotatedAt: credential.rotatedAt || null,
    expiresAt: credential.expiresAt || null,
    deliveryRef: credential.deliveryRef || null,
    notes: credential.notes || null,
  });
}

/**
 * Rotates an existing credential in memory by incrementing version and setting a new password hash.
 */
export function rotateCredential(accessIdentifier: string, newPasswordHash: string): EvaluationCredential | null {
  const resolved = resolveAccessIdentifier(accessIdentifier) || accessIdentifier;
  const existing = inMemoryRegistry.get(resolved.toUpperCase());
  if (!existing) return null;

  const updated: EvaluationCredential = {
    ...existing,
    passwordHash: newPasswordHash,
    credentialVersion: existing.credentialVersion + 1,
    updatedAt: new Date().toISOString(),
    rotatedAt: new Date().toISOString(),
  };

  inMemoryRegistry.set(resolved.toUpperCase(), updated);
  return updated;
}

/**
 * Rotates a credential in Firestore by incrementing version and updating hash.
 */
export async function rotateCredentialInFirestore(
  accessIdentifier: string,
  newPasswordHash: string,
  customDb?: any
): Promise<EvaluationCredential | null> {
  const db = customDb || (await getFirestoreDb());
  const resolved = resolveAccessIdentifier(accessIdentifier) || accessIdentifier;
  const docRef = db.collection(EVALUATION_CREDENTIALS_COLLECTION).doc(resolved.toUpperCase());
  const docSnap = await docRef.get();
  if (!docSnap.exists) return null;

  const current = docSnap.data();
  const newVersion = (current.credentialVersion || 1) + 1;
  const nowIso = new Date().toISOString();

  const updated: EvaluationCredential = {
    ...mapFirestoreDocToCredential(current),
    passwordHash: newPasswordHash,
    credentialVersion: newVersion,
    updatedAt: nowIso,
    rotatedAt: nowIso,
  };

  await docRef.set(updated);
  return updated;
}

/**
 * Deactivates a credential in memory.
 */
export function deactivateCredential(accessIdentifier: string): boolean {
  const resolved = resolveAccessIdentifier(accessIdentifier) || accessIdentifier;
  const existing = inMemoryRegistry.get(resolved.toUpperCase());
  if (!existing) return false;

  existing.isActive = false;
  existing.updatedAt = new Date().toISOString();
  inMemoryRegistry.set(resolved.toUpperCase(), existing);
  return true;
}

/**
 * Deactivates a credential in Firestore.
 */
export async function deactivateCredentialInFirestore(accessIdentifier: string, customDb?: any): Promise<boolean> {
  const db = customDb || (await getFirestoreDb());
  const resolved = resolveAccessIdentifier(accessIdentifier) || accessIdentifier;
  const docRef = db.collection(EVALUATION_CREDENTIALS_COLLECTION).doc(resolved.toUpperCase());
  const docSnap = await docRef.get();
  if (!docSnap.exists) return false;

  await docRef.update({
    isActive: false,
    updatedAt: new Date().toISOString(),
  });
  return true;
}

/**
 * Clears the in-memory registry (for tests).
 */
export function clearRegistry(): void {
  inMemoryRegistry.clear();
  resetRateLimits();
}

/**
 * Synthetic password generator for automated test fixtures only.
 * Avoids complex entropy patterns that trip automated repository secret scanners.
 */
export function getTestStatePassword(code: string): string {
  return `test-fixture-eval-pwd-${code.toLowerCase()}`;
}

export function getTestLeadershipPassword(): string {
  return 'test-fixture-eval-pwd-leadership';
}

export function getTestAdminPassword(): string {
  return 'test-fixture-eval-pwd-admin';
}

export function getTestReviewerMhPassword(): string {
  return 'test-fixture-eval-pwd-rev-mh';
}

export async function initializeTestFixtures(): Promise<void> {
  clearRegistry();

  // 1. Canonical State Evaluation Credentials
  for (const st of CANONICAL_EVALUATION_STATES) {
    const testPassword = getTestStatePassword(st.code);
    const hash = await hashPassword(testPassword);
    registerCredential({
      id: `eval-${st.code.toLowerCase()}-01`,
      accessIdentifier: st.accessIdentifier,
      displayName: `${st.name} State Evaluation`,
      credentialKind: 'STATE_EVALUATION',
      stateCode: st.name,
      programmeScope: ['alliance-childcare-phase3'],
      passwordHash: hash,
      credentialVersion: 1,
      isActive: true,
      createdAt: '2026-10-13T10:00:00.000Z',
      updatedAt: '2026-10-13T10:00:00.000Z',
      deliveryRef: `vault://synthetic-test/${st.accessIdentifier.toLowerCase()}`,
      notes: `Test fixture for ${st.name} state evaluation`,
    });
  }

  // 2. Leadership Evaluation Credential (All States read scope)
  const leadPassword = process.env.INITIAL_LEADERSHIP_PWD || getTestLeadershipPassword();
  const leadHash = await hashPassword(leadPassword);
  registerCredential({
    id: 'lead-nat-01',
    accessIdentifier: LEADERSHIP_ACCESS_IDENTIFIER,
    displayName: 'National Programme Leadership (All States)',
    credentialKind: 'LEADERSHIP_EVALUATION',
    stateCode: null,
    programmeScope: ['alliance-childcare-phase3'],
    passwordHash: leadHash,
    credentialVersion: 1,
    isActive: true,
    createdAt: '2026-10-13T10:00:00.000Z',
    updatedAt: '2026-10-13T10:00:00.000Z',
    deliveryRef: 'vault://synthetic-test/leadership-all',
    notes: 'Shared leadership credential for Managers and Directors',
  });

  // 3. Admin Maintenance Credential
  const adminPassword = process.env.INITIAL_ADMIN_PWD || getTestAdminPassword();
  const adminHash = await hashPassword(adminPassword);
  registerCredential({
    id: 'admin-01',
    accessIdentifier: ADMIN_ACCESS_IDENTIFIER,
    displayName: 'System Administrator',
    credentialKind: 'ADMIN',
    stateCode: null,
    programmeScope: ['alliance-childcare-phase3'],
    passwordHash: adminHash,
    credentialVersion: 1,
    isActive: true,
    createdAt: '2026-10-13T10:00:00.000Z',
    updatedAt: '2026-10-13T10:00:00.000Z',
    deliveryRef: 'vault://synthetic-test/admin-system',
    notes: 'Internal system administrator credential',
  });

  // 4. Backward Compatibility Aliases for pre-existing tests:
  // 'reviewer_mh' -> mirrors STATE-MH with INITIAL_REV_MH_PWD
  const revMhPassword = process.env.INITIAL_REV_MH_PWD || getTestReviewerMhPassword();
  const revMhHash = await hashPassword(revMhPassword);
  registerCredential({
    id: 'rev-mh-01',
    accessIdentifier: 'reviewer_mh',
    displayName: 'Maharashtra State Reviewer',
    credentialKind: 'STATE_EVALUATION',
    stateCode: 'Maharashtra',
    programmeScope: ['alliance-childcare-phase3'],
    passwordHash: revMhHash,
    credentialVersion: 1,
    isActive: true,
    createdAt: '2026-10-13T10:00:00.000Z',
    updatedAt: '2026-10-13T10:00:00.000Z',
    notes: 'Backward-compatible test fixture alias',
  });

  // 'admin' -> mirrors ADMIN-SYSTEM
  registerCredential({
    id: 'admin-01',
    accessIdentifier: 'admin',
    displayName: 'System Administrator',
    credentialKind: 'ADMIN',
    stateCode: null,
    programmeScope: ['alliance-childcare-phase3'],
    passwordHash: adminHash,
    credentialVersion: 1,
    isActive: true,
    createdAt: '2026-10-13T10:00:00.000Z',
    updatedAt: '2026-10-13T10:00:00.000Z',
    notes: 'Backward-compatible test fixture alias',
  });

  // 'leadership_india' -> mirrors LEADERSHIP-ALL
  registerCredential({
    id: 'lead-nat-01',
    accessIdentifier: 'leadership_india',
    displayName: 'National Programme Leadership',
    credentialKind: 'LEADERSHIP_EVALUATION',
    stateCode: null,
    programmeScope: ['alliance-childcare-phase3'],
    passwordHash: leadHash,
    credentialVersion: 1,
    isActive: true,
    createdAt: '2026-10-13T10:00:00.000Z',
    updatedAt: '2026-10-13T10:00:00.000Z',
    notes: 'Backward-compatible test fixture alias',
  });
}
