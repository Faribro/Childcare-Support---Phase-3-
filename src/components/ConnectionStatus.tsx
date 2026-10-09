'use client';

import React from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle, Database } from 'lucide-react';
import {
  NetworkStatus,
  DataSource,
  SyncStatus,
  formatSystemStatus,
} from '@/lib/status/statusModel';

export interface ConnectionStatusProps {
  networkStatus?: NetworkStatus;
  dataSource?: DataSource;
  syncStatus?: SyncStatus;
  showText?: boolean;
  className?: string;
}

export function ConnectionStatus({
  networkStatus = 'online',
  dataSource = 'live',
  syncStatus = 'synced',
  showText = true,
  className = '',
}: ConnectionStatusProps) {
  const formatted = formatSystemStatus({
    networkStatus,
    dataSource,
    syncStatus,
  });

  const getVariantStyles = () => {
    switch (formatted.variant) {
      case 'success':
        return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'warning':
        return 'bg-amber-50 border-amber-300 text-amber-800';
      case 'info':
        return 'bg-sky-50 border-sky-200 text-sky-700';
      case 'error':
        return 'bg-rose-50 border-rose-200 text-rose-700';
      default:
        return 'bg-slate-50 border-slate-200 text-slate-600';
    }
  };

  const renderIcon = () => {
    if (networkStatus === 'offline') {
      return <WifiOff className="h-3.5 w-3.5 text-amber-600 shrink-0" />;
    }
    if (syncStatus === 'retrying' || syncStatus === 'pending') {
      return <RefreshCw className="h-3.5 w-3.5 text-sky-600 shrink-0 animate-spin" />;
    }
    if (syncStatus === 'failed') {
      return <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />;
    }
    if (dataSource === 'cache') {
      return <Database className="h-3.5 w-3.5 text-amber-600 shrink-0" />;
    }
    return <Wifi className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={formatted.ariaLabel}
      title={formatted.label}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${getVariantStyles()} ${className}`}
    >
      {renderIcon()}
      {showText && <span>{formatted.label}</span>}
    </div>
  );
}
