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
import {
  CaregiverSubscriptionStateMachine,
  ICaregiverSubscriptionStore,
  MemoryCaregiverSubscriptionStore,
} from '@/features/caregiver-subscription';
import {
  WhatsAppDocumentLoopService,
  DocumentReminderScheduler,
  MemoryDocumentLoopStore,
} from '@/features/whatsapp-document-loop';
import {
  WhatsAppOutboundSender,
  MockWhatsAppHttpTransport,
  PersistentFileOutboundRegistry,
} from '@/lib/server/whatsappOutboundSender';
import { getAppEnvConfig } from '@/lib/server/envConfig';

let sharedInboundPersistence: IInboundPersistence | null = null;
let sharedSessionRepository: IReportingSessionRepository | null = null;
let sharedConfirmationStore: IExportConfirmationStore | null = null;
let sharedPipeline: WhatsAppReportingPipeline | null = null;
let sharedCaregiverStore: ICaregiverSubscriptionStore | null = null;
let sharedCaregiverStateMachine: CaregiverSubscriptionStateMachine | null = null;
let sharedReminderScheduler: DocumentReminderScheduler | null = null;
let sharedDocumentLoopService: WhatsAppDocumentLoopService | null = null;
let sharedOutboundSender: WhatsAppOutboundSender | null = null;

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

export function getCaregiverSubscriptionStore(): ICaregiverSubscriptionStore {
  if (!sharedCaregiverStore) {
    sharedCaregiverStore = new MemoryCaregiverSubscriptionStore();
  }
  return sharedCaregiverStore;
}

export function getCaregiverSubscriptionStateMachine(): CaregiverSubscriptionStateMachine {
  if (!sharedCaregiverStateMachine) {
    const store = getCaregiverSubscriptionStore();
    sharedCaregiverStateMachine = new CaregiverSubscriptionStateMachine(store);
  }
  return sharedCaregiverStateMachine;
}

export function getDocumentReminderScheduler(): DocumentReminderScheduler {
  if (!sharedReminderScheduler) {
    sharedReminderScheduler = new DocumentReminderScheduler();
  }
  return sharedReminderScheduler;
}

export function getDocumentLoopService(): WhatsAppDocumentLoopService {
  if (!sharedDocumentLoopService) {
    const store = new MemoryDocumentLoopStore();
    const scheduler = getDocumentReminderScheduler();
    sharedDocumentLoopService = new WhatsAppDocumentLoopService(
      store,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      scheduler
    );
  }
  return sharedDocumentLoopService;
}

export function getWhatsAppOutboundSender(): WhatsAppOutboundSender {
  if (!sharedOutboundSender) {
    const mockTransport = new MockWhatsAppHttpTransport();
    const registry = new PersistentFileOutboundRegistry({
      allowLocalFilesystemInProduction: true,
    });
    sharedOutboundSender = new WhatsAppOutboundSender(
      {
        phoneNumberId: process.env.META_PHONE_NUMBER_ID || '1413691425156891',
        accessToken: process.env.META_ACCESS_TOKEN || 'synthetic_access_token',
        graphApiVersion: process.env.META_GRAPH_API_VERSION || 'v20.0',
        allowLocalFilesystemInProduction: true,
      },
      mockTransport,
      registry
    );
  }
  return sharedOutboundSender;
}

export function resetWhatsAppPipelineForTesting(overrides?: {
  inboundPersistence?: IInboundPersistence;
  sessionRepository?: IReportingSessionRepository;
  confirmationStore?: IExportConfirmationStore;
  pipeline?: WhatsAppReportingPipeline;
  caregiverStore?: ICaregiverSubscriptionStore;
  caregiverStateMachine?: CaregiverSubscriptionStateMachine;
  reminderScheduler?: DocumentReminderScheduler;
  documentLoopService?: WhatsAppDocumentLoopService;
  outboundSender?: WhatsAppOutboundSender;
}): void {
  sharedInboundPersistence = overrides?.inboundPersistence || null;
  sharedSessionRepository = overrides?.sessionRepository || null;
  sharedConfirmationStore = overrides?.confirmationStore || null;
  sharedPipeline = overrides?.pipeline || null;
  sharedCaregiverStore = overrides?.caregiverStore || null;
  sharedCaregiverStateMachine = overrides?.caregiverStateMachine || null;
  sharedReminderScheduler = overrides?.reminderScheduler || null;
  sharedDocumentLoopService = overrides?.documentLoopService || null;
  sharedOutboundSender = overrides?.outboundSender || null;
}
