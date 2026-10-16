/**
 * Platform Registry & Client Context
 *
 * Provides dependency injection for platform adapters, routing native requests
 * through the reviewed SQLite, filesystem, and secure keystore implementations
 * while allowing web to use Dexie IndexedDB.
 */

import type {
  StorageAdapter,
  AttachmentStorageAdapter,
  SecureStorageAdapter,
  NetworkAdapter,
  AppLifecycleAdapter,
  PlatformTarget,
  PlatformConfig,
} from './types';
import { Capacitor } from '@capacitor/core';
import { SQLiteStorageAdapter } from './sqliteStorageAdapter';
import { PrivateFilesystemAttachmentAdapter } from './privateFilesystemAttachmentAdapter';
import { PlatformSecureStorageAdapter } from './secureStorageAdapter';
import { PlatformNetworkAdapter, PlatformAppLifecycleAdapter } from './lifecycleAdapters';
import { WebStorageAdapter } from './webStorageAdapter';

class PlatformRegistryService {
  private config: PlatformConfig;
  private storageAdapter: StorageAdapter;
  private attachmentAdapter: AttachmentStorageAdapter;
  private secureStorageAdapter: SecureStorageAdapter;
  private networkAdapter: NetworkAdapter;
  private appLifecycleAdapter: AppLifecycleAdapter;

  constructor() {
    const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();
    const defaultTarget: PlatformTarget = isNative ? 'android' : 'web';
    this.config = {
      target: defaultTarget,
      apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || '',
      currentUserId: null,
    };
    if (defaultTarget === 'android') {
      this.storageAdapter = new SQLiteStorageAdapter();
      this.attachmentAdapter = new PrivateFilesystemAttachmentAdapter();
      this.secureStorageAdapter = new PlatformSecureStorageAdapter('android');
      this.networkAdapter = new PlatformNetworkAdapter('android', true);
      this.appLifecycleAdapter = new PlatformAppLifecycleAdapter('android');
    } else {
      this.storageAdapter = new WebStorageAdapter();
      this.attachmentAdapter = new PrivateFilesystemAttachmentAdapter();
      this.secureStorageAdapter = new PlatformSecureStorageAdapter('web');
      this.networkAdapter = new PlatformNetworkAdapter('web', typeof navigator !== 'undefined' ? navigator.onLine : true);
      this.appLifecycleAdapter = new PlatformAppLifecycleAdapter('web');
    }
  }

  public configure(config: Partial<PlatformConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.target === 'web') {
      this.storageAdapter = new WebStorageAdapter();
      this.secureStorageAdapter = new PlatformSecureStorageAdapter('web');
      this.networkAdapter = new PlatformNetworkAdapter('web', typeof navigator !== 'undefined' ? navigator.onLine : true);
      this.appLifecycleAdapter = new PlatformAppLifecycleAdapter('web');
    } else if (config.target === 'android') {
      this.storageAdapter = new SQLiteStorageAdapter({
        encryptionKey: config.databaseEncryptionKey,
      });
      this.attachmentAdapter = new PrivateFilesystemAttachmentAdapter();
      this.secureStorageAdapter = new PlatformSecureStorageAdapter('android');
      this.networkAdapter = new PlatformNetworkAdapter('android', true);
      this.appLifecycleAdapter = new PlatformAppLifecycleAdapter('android');
    }
  }

  public reset(): void {
    const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();
    this.configure({
      target: isNative ? 'android' : 'web',
      currentUserId: null,
    });
  }

  public setCustomAdapters(adapters: {
    storage?: StorageAdapter;
    attachment?: AttachmentStorageAdapter;
    secureStorage?: SecureStorageAdapter;
    network?: NetworkAdapter;
    appLifecycle?: AppLifecycleAdapter;
  }): void {
    if (adapters.storage) this.storageAdapter = adapters.storage;
    if (adapters.attachment) this.attachmentAdapter = adapters.attachment;
    if (adapters.secureStorage) this.secureStorageAdapter = adapters.secureStorage;
    if (adapters.network) this.networkAdapter = adapters.network;
    if (adapters.appLifecycle) this.appLifecycleAdapter = adapters.appLifecycle;
  }

  public getTarget(): PlatformTarget {
    return this.config.target;
  }

  public getApiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }

  public resolveUrl(path: string): string {
    if (this.config.target === 'android') {
      const envBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://childcare-support-phase-3-peqat23bz-hashcode1.vercel.app';
      const baseUrl = this.getApiBaseUrl() || envBase;
      if (baseUrl) {
        const cleanBase = baseUrl.replace(/\/+$/, '');
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        return `${cleanBase}${cleanPath}`;
      }
    }
    return path;
  }

  public getBypassHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const bypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
    if (bypass) {
      headers['x-vercel-protection-bypass'] = bypass;
    }
    return headers;
  }

  public getCurrentUserId(): string | null {
    return this.config.currentUserId;
  }

  public setCurrentUserId(userId: string | null): void {
    this.config.currentUserId = userId;
  }

  public getStorage(): StorageAdapter {
    return this.storageAdapter;
  }

  public getAttachmentStorage(): AttachmentStorageAdapter {
    return this.attachmentAdapter;
  }

  public getSecureStorage(): SecureStorageAdapter {
    return this.secureStorageAdapter;
  }

  public getNetwork(): NetworkAdapter {
    return this.networkAdapter;
  }

  public getAppLifecycle(): AppLifecycleAdapter {
    return this.appLifecycleAdapter;
  }
}

export const platformRegistry = new PlatformRegistryService();
