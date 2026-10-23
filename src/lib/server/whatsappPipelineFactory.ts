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
  IDurableDocumentLoopStore,
  MemoryDocumentLoopStore,
  SupabaseDocumentLoopStore,
} from '@/features/whatsapp-document-loop/persistence';
import {
  CaregiverSubscriptionStateMachine,
  ICaregiverSubscriptionStore,
  MemoryCaregiverSubscriptionStore,
  SupabaseCaregiverSubscriptionStore,
} from '@/features/caregiver-subscription';
import {
  WhatsAppDocumentLoopService,
  DocumentReminderScheduler,
  IReminderStore,
  MemoryReminderStore,
  SupabaseReminderStore,
} from '@/features/whatsapp-document-loop';
import {
  WhatsAppOutboundSender,
  FetchWhatsAppHttpTransport,
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
    const env = getAppEnvConfig();
    if (env.supabaseUrl && env.supabaseServiceRoleKey) {
      sharedCaregiverStore = new SupabaseCaregiverSubscriptionStore(env.supabaseUrl, env.supabaseServiceRoleKey);
    } else if (env.isProduction) {
      throw new Error(
        'SERVER_MISCONFIGURED: Caregiver subscription store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production. In-memory fallback is strictly forbidden.'
      );
    } else {
      sharedCaregiverStore = new MemoryCaregiverSubscriptionStore();
    }
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
    const env = getAppEnvConfig();
    let reminderStore: IReminderStore;
    if (env.supabaseUrl && env.supabaseServiceRoleKey) {
      reminderStore = new SupabaseReminderStore(env.supabaseUrl, env.supabaseServiceRoleKey);
    } else if (env.isProduction) {
      throw new Error(
        'SERVER_MISCONFIGURED: Reminder store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production. In-memory fallback is strictly forbidden.'
      );
    } else {
      reminderStore = new MemoryReminderStore();
    }
    sharedReminderScheduler = new DocumentReminderScheduler(undefined, reminderStore);
  }
  return sharedReminderScheduler;
}

export function getDocumentLoopService(): WhatsAppDocumentLoopService {
  if (!sharedDocumentLoopService) {
    const env = getAppEnvConfig();
    let store: IDurableDocumentLoopStore;

    if (env.supabaseUrl && env.supabaseServiceRoleKey) {
      store = new SupabaseDocumentLoopStore(env.supabaseUrl, env.supabaseServiceRoleKey);
    } else if (env.isProduction) {
      throw new Error(
        'SERVER_MISCONFIGURED: Document loop store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production. In-memory fallback is strictly forbidden.'
      );
    } else {
      store = new MemoryDocumentLoopStore();
    }

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
    const env = getAppEnvConfig();
    const token = env.metaAccessToken;
    const phoneId = env.metaPhoneNumberId;

    if (env.isProduction) {
      if (!token || !phoneId) {
        throw new Error(
          'SERVER_MISCONFIGURED: WhatsApp outbound sender requires META_ACCESS_TOKEN and META_PHONE_NUMBER_ID in production. Synthetic fallback is strictly forbidden.'
        );
      }
    }

    const transport = new FetchWhatsAppHttpTransport();
    const registry = new PersistentFileOutboundRegistry({
      allowLocalFilesystemInProduction: true,
    });

    sharedOutboundSender = new WhatsAppOutboundSender(
      {
        phoneNumberId: phoneId || '1413691425156891',
        accessToken: token || 'synthetic_access_token',
        graphApiVersion: env.metaGraphApiVersion || 'v20.0',
        allowLocalFilesystemInProduction: true,
      },
      transport,
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
