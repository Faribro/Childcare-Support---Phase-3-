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

let sharedInboundPersistence: IInboundPersistence | null = null;
let sharedSessionRepository: IReportingSessionRepository | null = null;
let sharedConfirmationStore: IExportConfirmationStore | null = null;
let sharedPipeline: WhatsAppReportingPipeline | null = null;

export function getInboundPersistence(): IInboundPersistence {
  if (!sharedInboundPersistence) {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      sharedInboundPersistence = new SupabaseInboundPersistence();
    } else {
      sharedInboundPersistence = new MemoryInboundPersistence();
    }
  }
  return sharedInboundPersistence;
}

export function getSessionRepository(): IReportingSessionRepository {
  if (!sharedSessionRepository) {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      sharedSessionRepository = new SupabaseReportingSessionRepository();
    } else {
      sharedSessionRepository = new InMemoryReportingSessionRepository();
    }
  }
  return sharedSessionRepository;
}

export function getExportConfirmationStore(): IExportConfirmationStore {
  if (!sharedConfirmationStore) {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      sharedConfirmationStore = new SupabaseExportConfirmationStore();
    } else {
      sharedConfirmationStore = new InMemoryExportConfirmationStore();
    }
  }
  return sharedConfirmationStore;
}

export function getWhatsAppReportingPipeline(): WhatsAppReportingPipeline {
  if (!sharedPipeline) {
    const isLiveEmail = process.env.ALLOW_LIVE_EMAIL_DISPATCH === 'true';
    const emailDispatcher = isLiveEmail
      ? new AppsScriptReportingEmailDispatcher()
      : new MockReportingEmailDispatcher();

    const dataAdapter = process.env.APPS_SCRIPT_URL
      ? new AppsScriptAuthorizedDataAdapter()
      : new SyntheticAuthorizedDataAdapter();

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
