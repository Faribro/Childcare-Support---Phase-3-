/**
 * PlatformSecureStorageAdapter: Native Secure Keystore Adapter
 *
 * Implements:
 * 1. Native Android KeyStore / EncryptedSharedPreferences binding via @aparajita/capacitor-secure-storage.
 * 2. In-memory fallback in non-native / test environments (Node/Vitest) for zero-dependency testability.
 * 3. Secure key-value retention and memory wipe on logout / user switch.
 */

import type { SecureStorageAdapter, PlatformTarget } from './types';
import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

export class PlatformSecureStorageAdapter implements SecureStorageAdapter {
  public readonly platform: PlatformTarget;
  private memoryStore: Map<string, string> = new Map();

  constructor(platform: PlatformTarget = 'android') {
    this.platform = platform;
  }

  public isNativeActive(): boolean {
    return Capacitor.isNativePlatform();
  }

  async getSecret(key: string): Promise<string | null> {
    if (this.isNativeActive()) {
      try {
        const val = await SecureStorage.get(key);
        if (val === null || val === undefined) return null;
        return typeof val === 'string' ? val : JSON.stringify(val);
      } catch (err: any) {
        // Fall back to memoryStore if native call fails or key not found
        return this.memoryStore.get(key) ?? null;
      }
    }
    return this.memoryStore.get(key) ?? null;
  }

  async setSecret(key: string, value: string): Promise<void> {
    if (!key || typeof key !== 'string') throw new Error('Invalid secret key');
    if (this.isNativeActive()) {
      try {
        await SecureStorage.set(key, value);
      } catch (err: any) {
        console.warn('[PlatformSecureStorageAdapter] Native SecureStorage.set failed, storing in memoryStore:', err);
      }
    }
    this.memoryStore.set(key, value);
  }

  async removeSecret(key: string): Promise<void> {
    if (this.isNativeActive()) {
      try {
        await SecureStorage.remove(key);
      } catch (_) {}
    }
    this.memoryStore.delete(key);
  }

  async clearSecrets(preserveDbKey: boolean = true): Promise<void> {
    const dbKey = preserveDbKey ? await this.getSecret('childcare_db_key') : null;
    if (this.isNativeActive()) {
      try {
        await SecureStorage.clear();
      } catch (_) {}
    }
    this.memoryStore.clear();
    if (preserveDbKey && dbKey) {
      await this.setSecret('childcare_db_key', dbKey);
    }
  }

  async clearSessionSecrets(): Promise<void> {
    await this.clearSecrets(true);
  }
}
