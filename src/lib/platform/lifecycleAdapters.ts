/**
 * Network & App Lifecycle Adapters
 *
 * Implements:
 * 1. Native Android network state listening via @capacitor/network.
 * 2. Native Android app foreground / background / resume lifecycle hooks via @capacitor/app.
 * 3. In-memory / simulation hooks for deterministic testing and non-native environments.
 */

import type { NetworkAdapter, AppLifecycleAdapter, PlatformTarget } from './types';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';

export class PlatformNetworkAdapter implements NetworkAdapter {
  public readonly platform: PlatformTarget;
  private online: boolean;
  private listeners: Set<(online: boolean) => void> = new Set();
  private nativeListenerAttached = false;

  constructor(platform: PlatformTarget = 'android', initialOnline = true) {
    this.platform = platform;
    this.online = initialOnline;
    this.initNativeListener();
  }

  public isNativeActive(): boolean {
    return Capacitor.isNativePlatform();
  }

  private initNativeListener(): void {
    if (this.isNativeActive() && !this.nativeListenerAttached) {
      try {
        Network.addListener('networkStatusChange', (status) => {
          this.online = status.connected;
          for (const cb of this.listeners) {
            try {
              cb(status.connected);
            } catch (_) {}
          }
        });
        this.nativeListenerAttached = true;
      } catch (_) {}
    }
  }

  async isOnline(): Promise<boolean> {
    if (this.isNativeActive()) {
      try {
        const status = await Network.getStatus();
        this.online = status.connected;
        return status.connected;
      } catch (_) {
        return this.online;
      }
    }
    return this.online;
  }

  onNetworkChange(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  simulateNetworkChange(online: boolean): void {
    if (this.online !== online) {
      this.online = online;
      for (const cb of this.listeners) {
        try {
          cb(online);
        } catch (_) {}
      }
    }
  }
}

export class PlatformAppLifecycleAdapter implements AppLifecycleAdapter {
  public readonly platform: PlatformTarget;
  private listeners: Set<(state: 'active' | 'background' | 'resumed') => void> = new Set();
  private nativeListenerAttached = false;

  constructor(platform: PlatformTarget = 'android') {
    this.platform = platform;
    this.initNativeListener();
  }

  public isNativeActive(): boolean {
    return Capacitor.isNativePlatform();
  }

  private initNativeListener(): void {
    if (this.isNativeActive() && !this.nativeListenerAttached) {
      try {
        App.addListener('appStateChange', (state) => {
          const mapped = state.isActive ? 'active' : 'background';
          for (const cb of this.listeners) {
            try {
              cb(mapped);
            } catch (_) {}
          }
        });
        App.addListener('resume', () => {
          for (const cb of this.listeners) {
            try {
              cb('resumed');
            } catch (_) {}
          }
        });
        this.nativeListenerAttached = true;
      } catch (_) {}
    }
  }

  onStateChange(callback: (state: 'active' | 'background' | 'resumed') => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  simulateStateChange(state: 'active' | 'background' | 'resumed'): void {
    for (const cb of this.listeners) {
      try {
        cb(state);
      } catch (_) {}
    }
  }
}
