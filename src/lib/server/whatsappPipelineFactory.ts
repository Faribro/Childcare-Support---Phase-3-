import {
  WhatsAppReportingPipeline,
  LeadershipReportingAgent,
  SenderIdentityResolver,
  WhatsAppFormatter,
  AppsScriptAuthorizedDataAdapter,
  SyntheticAuthorizedDataAdapter,
  AppsScriptReportingEmailDispatcher,
  MockReportingEmailDispatcher,
  SupabaseReportingSessionRepository,
  InMemoryReportingSessionRepository,
  IReportingSessionRepository,
  SupabaseExportConfirmationStore,
  InMemoryExportConfirmationStore,
  IExportConfirmationStore,
} from '@/features/leadership-reporting';
import {
  IInboundPersistence,
  SupabaseInboundPersistence,
  MemoryInboundPersistence,
} from '@/features/whatsapp-document-loop/persistence';
import { getAppEnvConfig } from '@/lib/server/envConfig';

let sharedInboundPersistence: IInboundPersistence | null = null;
let sharedSessionRepository: IReportingSessionRepository | null = null;
let sharedConfirmationStore: IExportConfirmationStore | null = null;
let sharedPipeline: WhatsAppReportingPipeline | null = null;

export function getInboundPersistence(): IInboundPersistence {
  if (!sharedInboundPersistence) {
    const env = getAppEnvConfig();
    if (env.supabaseUrl && env.supabaseServiceRoleKey) {
      sharedInboundPersistence = new SupabaseInboundPersistence(env.supabaseUrl, env.supabaseServiceRoleKey);
    } else if (env.isProduction) {
      throw new Error(
        'SERVER_MISCONFIGURED: Inbound persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production. In-memory fallback is strictly forbidden.'
      );
    } else {
      sharedInboundPersistence = new MemoryInboundPersistence();
    }
  }
  return sharedInboundPersistence;
}

export function getSessionRepository(): IReportingSessionRepository {
  if (!sharedSessionRepository) {
    const env = getAppEnvConfig();
    if (env.supabaseUrl && env.supabaseServiceRoleKey) {
      sharedSessionRepository = new SupabaseReportingSessionRepository(env.supabaseUrl, env.supabaseServiceRoleKey);
    } else if (env.isProduction) {
      throw new Error(
        'SERVER_MISCONFIGURED: Reporting session persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production. In-memory fallback is strictly forbidden.'
      );
    } else {
      sharedSessionRepository = new InMemoryReportingSessionRepository();
    }
  }
  return sharedSessionRepository;
}

export function getExportConfirmationStore(): IExportConfirmationStore {
  if (!sharedConfirmationStore) {
    const env = getAppEnvConfig();
    if (env.supabaseUrl && env.supabaseServiceRoleKey) {
      sharedConfirmationStore = new SupabaseExportConfirmationStore(env.supabaseUrl, env.supabaseServiceRoleKey);
    } else if (env.isProduction) {
      throw new Error(
        'SERVER_MISCONFIGURED: Export confirmation store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production. In-memory fallback is strictly forbidden.'
      );
    } else {
      sharedConfirmationStore = new InMemoryExportConfirmationStore();
    }
  }
  return sharedConfirmationStore;
}

export function getWhatsAppReportingPipeline(): WhatsAppReportingPipeline {
  if (!sharedPipeline) {
    const env = getAppEnvConfig();
    const emailDispatcher = env.allowLiveEmailDispatch
      ? new AppsScriptReportingEmailDispatcher(env.appsScriptUrl, env.appsScriptSecret)
      : new MockReportingEmailDispatcher();

    let dataAdapter: any;
    if (env.appsScriptUrl) {
      dataAdapter = new AppsScriptAuthorizedDataAdapter(env.appsScriptUrl, env.appsScriptSecret);
    } else if (env.isProduction) {
      throw new Error(
        'SERVER_MISCONFIGURED: Live reporting requires APPS_SCRIPT_URL in production. Synthetic fallback is strictly forbidden.'
      );
    } else {
      dataAdapter = new SyntheticAuthorizedDataAdapter();
    }

    const confirmationStore = getExportConfirmationStore();
    const sessionRepo = getSessionRepository();

    const agent = new LeadershipReportingAgent(
      dataAdapter,
      undefined,
      undefined,
      new WhatsAppFormatter(),
      undefined,
      emailDispatcher,
      confirmationStore
    );

    sharedPipeline = new WhatsAppReportingPipeline(
      new SenderIdentityResolver(),
      agent,
      new WhatsAppFormatter(),
      sessionRepo
    );
  }
  return sharedPipeline;
}

export function resetWhatsAppPipelineForTesting(overrides?: {
  inboundPersistence?: IInboundPersistence;
  sessionRepository?: IReportingSessionRepository;
  confirmationStore?: IExportConfirmationStore;
  pipeline?: WhatsAppReportingPipeline;
}): void {
  sharedInboundPersistence = overrides?.inboundPersistence || null;
  sharedSessionRepository = overrides?.sessionRepository || null;
  sharedConfirmationStore = overrides?.confirmationStore || null;
  sharedPipeline = overrides?.pipeline || null;
}
