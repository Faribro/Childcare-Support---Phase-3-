import { ReportingSession } from './types';
import { getAppEnvConfig } from '@/lib/server/envConfig';

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
