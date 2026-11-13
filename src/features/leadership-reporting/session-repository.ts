import { ReportingSession } from './types';
import { getAppEnvConfig } from '@/lib/server/envConfig';
import { validateFirestoreDatabaseEnvironment } from '@/lib/server/firestoreSubmissionAdapter';
import { getFirestoreDb } from '@/lib/server/credentialRegistry';

export const REPORTING_SESSIONS_COLLECTION = 'reporting_sessions';

/**
 * Interface defining durable persistence for conversational reporting sessions.
 * Mirrors public.reporting_sessions in supabase/migrations/20261015220000_whatsapp_document_loop.sql.
 */
export interface IReportingSessionRepository {
  getSession(userId: string): Promise<ReportingSession | null>;
  saveSession(userId: string, session: ReportingSession): Promise<void>;
  deleteSession?(userId: string): Promise<void>;
}

/**
 * In-memory implementation of IReportingSessionRepository for fast unit testing.
 */
export class InMemoryReportingSessionRepository implements IReportingSessionRepository {
  private readonly sessions = new Map<string, ReportingSession>();

  public async getSession(userId: string): Promise<ReportingSession | null> {
    const s = this.sessions.get(userId);
    return s ? JSON.parse(JSON.stringify(s)) : null;
  }

  public async saveSession(userId: string, session: ReportingSession): Promise<void> {
    this.sessions.set(userId, JSON.parse(JSON.stringify(session)));
  }

  public async deleteSession(userId: string): Promise<void> {
    this.sessions.delete(userId);
  }

  public clear(): void {
    this.sessions.clear();
  }
}

/**
 * Supabase PostgREST Reporting Session Repository
 * Connects directly to public.reporting_sessions.
 */
export class SupabaseReportingSessionRepository implements IReportingSessionRepository {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fallbackMemory: InMemoryReportingSessionRepository;

  constructor(supabaseUrl?: string, serviceRoleKey?: string) {
    const env = getAppEnvConfig();
    this.baseUrl = (supabaseUrl || env.supabaseUrl || '').replace(/\/+$/, '');
    this.apiKey = serviceRoleKey || env.supabaseServiceRoleKey || '';
    this.fallbackMemory = new InMemoryReportingSessionRepository();
  }

  private get isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  private get isProduction(): boolean {
    return (
      process.env.NODE_ENV === 'production' ||
      process.env.VERCEL_ENV === 'production'
    );
  }

  private get headers(): Record<string, string> {
    return {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    };
  }

  public async getSession(userId: string): Promise<ReportingSession | null> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Reporting session persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production. In-memory fallback is strictly forbidden.'
        );
      }
      return this.fallbackMemory.getSession(userId);
    }

    try {
      const url = `${this.baseUrl}/rest/v1/reporting_sessions?owner_user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=1`;
      const res = await fetch(url, { method: 'GET', headers: this.headers });

      if (!res.ok) {
        if (this.isProduction) {
          throw new Error(`DURABLE_STORAGE_ERROR: Failed to query reporting session: HTTP ${res.status}`);
        }
        return this.fallbackMemory.getSession(userId);
      }

      const rows = (await res.json()) as any[];
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      const row = rows[0];
      const stateObj = typeof row.session_state === 'string' ? JSON.parse(row.session_state) : (row.session_state || {});

      const session: ReportingSession = {
        sessionId: row.session_id,
        ownerUserId: row.owner_user_id,
        callerScope: {
          userId: row.owner_user_id,
          role: row.caller_role,
          permittedStates: row.permitted_states || ['*'],
          permittedDistricts: stateObj.permittedDistricts || ['*'],
          permittedProgrammes: stateObj.permittedProgrammes || ['*'],
          isActive: stateObj.isActive !== false,
        },
        activeStateFilter: row.active_state_filter,
        activeDateBasis: stateObj.activeDateBasis || 'VISIT_DATE',
        confirmedYear: row.confirmed_year ?? stateObj.confirmedYear,
        confirmedDateBasis: row.confirmed_date_basis ?? stateObj.confirmedDateBasis,
        confirmedYearExplicitlyClarified: stateObj.confirmedYearExplicitlyClarified ?? false,
        confirmedDateBasisExplicitlyClarified: stateObj.confirmedDateBasisExplicitlyClarified ?? false,
        isConfirmedPolicy: row.is_confirmed_policy ?? stateObj.isConfirmedPolicy ?? false,
        pendingClarification: stateObj.pendingClarification ?? null,
        pendingExport: stateObj.pendingExport ?? null,
        lastCohortResult: stateObj.lastCohortResult ?? null,
        messages: stateObj.messages || [],
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString(),
      };

      return session;
    } catch (err) {
      if (this.isProduction) throw err;
      return this.fallbackMemory.getSession(userId);
    }
  }

  public async saveSession(userId: string, session: ReportingSession): Promise<void> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Reporting session persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production. In-memory fallback is strictly forbidden.'
        );
      }
      await this.fallbackMemory.saveSession(userId, session);
      return;
    }

    try {
      const payload = {
        session_id: session.sessionId,
        owner_user_id: userId,
        caller_role: session.callerScope.role,
        permitted_states: session.callerScope.permittedStates,
        active_state_filter: session.activeStateFilter,
        confirmed_year: session.confirmedYear || null,
        confirmed_date_basis: session.confirmedDateBasis || null,
        is_confirmed_policy: session.isConfirmedPolicy ?? false,
        session_state: {
          activeDateBasis: session.activeDateBasis,
          confirmedYear: session.confirmedYear,
          confirmedDateBasis: session.confirmedDateBasis,
          confirmedYearExplicitlyClarified: session.confirmedYearExplicitlyClarified,
          confirmedDateBasisExplicitlyClarified: session.confirmedDateBasisExplicitlyClarified,
          isConfirmedPolicy: session.isConfirmedPolicy,
          pendingClarification: session.pendingClarification,
          pendingExport: session.pendingExport,
          lastCohortResult: session.lastCohortResult,
          permittedDistricts: session.callerScope.permittedDistricts || ['*'],
          permittedProgrammes: session.callerScope.permittedProgrammes || ['*'],
          isActive: session.callerScope.isActive !== false,
          messages: session.messages,
        },
        updated_at: new Date().toISOString(),
      };

      const url = `${this.baseUrl}/rest/v1/reporting_sessions?on_conflict=session_id`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.headers,
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (this.isProduction) {
          throw new Error(`DURABLE_STORAGE_ERROR: Failed to save reporting session in Supabase: HTTP ${res.status}`);
        }
        await this.fallbackMemory.saveSession(userId, session);
      }
    } catch (err) {
      if (this.isProduction) throw err;
      await this.fallbackMemory.saveSession(userId, session);
    }
  }

  public async deleteSession(userId: string): Promise<void> {
    if (!this.isConfigured) {
      if (this.isProduction) {
        throw new Error(
          'DURABLE_STORAGE_UNAVAILABLE: Reporting session persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production.'
        );
      }
      await this.fallbackMemory.deleteSession(userId);
      return;
    }

    try {
      const url = `${this.baseUrl}/rest/v1/reporting_sessions?owner_user_id=eq.${encodeURIComponent(userId)}`;
      const res = await fetch(url, { method: 'DELETE', headers: this.headers });
      if (!res.ok && this.isProduction) {
        throw new Error(`DURABLE_STORAGE_ERROR: Failed to delete session: HTTP ${res.status}`);
      }
    } catch (err) {
      if (this.isProduction) throw err;
      await this.fallbackMemory.deleteSession(userId);
    }
  }
}

/**
 * Cloud Firestore Reporting Session Repository (Phase B / Task 2b)
 * Connects directly to Firestore collection 'reporting_sessions'.
 * Uses document ID = userId.
 * TTL field = expiresAt (7 days).
 * Fails closed in staging/production if Firestore is unreachable.
 */
export class FirestoreReportingSessionRepository implements IReportingSessionRepository {
  private customDb?: any;

  constructor(customDb?: any) {
    this.customDb = customDb;
  }

  private async getDb() {
    const appEnv = process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development';
    const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
    validateFirestoreDatabaseEnvironment(appEnv, databaseId);

    const isProductionOrStaging =
      process.env.NODE_ENV === 'production' ||
      process.env.VERCEL_ENV === 'production' ||
      process.env.APP_ENV === 'production' ||
      (process.env.NODE_ENV as string) === 'staging' ||
      process.env.APP_ENV === 'staging';

    try {
      return await getFirestoreDb(this.customDb);
    } catch (err: any) {
      if (isProductionOrStaging) {
        throw new Error(
          `[REPORTING_SESSION_STORE_UNAVAILABLE] Cloud Firestore unreachable in ${appEnv}: ${err?.message || err}`
        );
      }
      throw err;
    }
  }

  public async getSession(userId: string): Promise<ReportingSession | null> {
    const db = await this.getDb();
    const docSnap = await db.collection(REPORTING_SESSIONS_COLLECTION).doc(userId).get();
    if (!docSnap.exists) {
      return null;
    }

    const data = docSnap.data();
    return {
      sessionId: data.sessionId,
      ownerUserId: data.ownerUserId || userId,
      callerScope: data.callerScope,
      activeStateFilter: data.activeStateFilter || null,
      activeDateBasis: data.activeDateBasis || 'VISIT_DATE',
      confirmedYear: data.confirmedYear ?? undefined,
      confirmedDateBasis: data.confirmedDateBasis ?? undefined,
      confirmedYearExplicitlyClarified: data.confirmedYearExplicitlyClarified ?? false,
      confirmedDateBasisExplicitlyClarified: data.confirmedDateBasisExplicitlyClarified ?? false,
      isConfirmedPolicy: data.isConfirmedPolicy ?? false,
      pendingClarification: data.pendingClarification ?? null,
      pendingExport: data.pendingExport ?? null,
      lastCohortResult: data.lastCohortResult ?? null,
      messages: data.messages || [],
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  }

  public async saveSession(userId: string, session: ReportingSession): Promise<void> {
    const db = await this.getDb();
    const docRef = db.collection(REPORTING_SESSIONS_COLLECTION).doc(userId);
    const ttlDays = 7;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await docRef.set({
      sessionId: session.sessionId,
      ownerUserId: userId,
      callerScope: session.callerScope,
      activeStateFilter: session.activeStateFilter || null,
      activeDateBasis: session.activeDateBasis,
      confirmedYear: session.confirmedYear ?? null,
      confirmedDateBasis: session.confirmedDateBasis ?? null,
      confirmedYearExplicitlyClarified: session.confirmedYearExplicitlyClarified ?? false,
      confirmedDateBasisExplicitlyClarified: session.confirmedDateBasisExplicitlyClarified ?? false,
      isConfirmedPolicy: session.isConfirmedPolicy ?? false,
      pendingClarification: session.pendingClarification || null,
      pendingExport: session.pendingExport || null,
      lastCohortResult: session.lastCohortResult || null,
      messages: session.messages || [],
      createdAt: session.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt, // Firestore TTL field
    });
  }

  public async deleteSession(userId: string): Promise<void> {
    const db = await this.getDb();
    await db.collection(REPORTING_SESSIONS_COLLECTION).doc(userId).delete();
  }
}
