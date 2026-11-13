/**
 * Structured Cloud Logging Utility for Google Cloud Run
 *
 * Implements Google Cloud Logging JSON payload standards:
 * https://cloud.google.com/logging/docs/structured-logging
 *
 * Automatically maps log severity levels to GCP Cloud Logging severity filters:
 * - INFO: Normal operational events (e.g. SIGNED_URL_ISSUED, DEPLOYMENT_READY)
 * - WARNING: Security anomalies, lockouts, auth denials (e.g. AUTH_FAILURE, LOCKOUT)
 * - ERROR: Infrastructure failures, mirror sync failures (e.g. MIRROR_FAILURE)
 *
 * Invariant: All context payloads are scrubbed of sensitive fields (PII, tokens, passwords, Aadhaar).
 */

import { sanitizeLogContext } from './errorLogger';

export type CloudLogSeverity =
  | 'DEFAULT'
  | 'DEBUG'
  | 'INFO'
  | 'NOTICE'
  | 'WARNING'
  | 'ERROR'
  | 'CRITICAL'
  | 'ALERT';

export type SecurityEventType =
  | 'AUTH_FAILURE'
  | 'LOCKOUT'
  | 'MIRROR_FAILURE'
  | 'SIGNED_URL_ISSUED'
  | 'SECURITY_EVENT'
  | 'RATE_LIMIT_EXCEEDED'
  | 'SESSION_REVOKED'
  | 'EXPORT_AUDIT';

export interface StructuredLogEntry {
  severity: CloudLogSeverity;
  message: string;
  eventType: SecurityEventType | string;
  timestamp: string;
  service?: string;
  environment?: string;
  context?: Record<string, unknown>;
  'logging.googleapis.com/labels'?: Record<string, string>;
}

export class CloudLogger {
  private static serviceName = 'childcare-support-phase3';

  private static emit(
    severity: CloudLogSeverity,
    eventType: SecurityEventType | string,
    message: string,
    context?: Record<string, unknown>
  ): StructuredLogEntry {
    const entry: StructuredLogEntry = {
      severity,
      message,
      eventType,
      timestamp: new Date().toISOString(),
      service: CloudLogger.serviceName,
      environment: process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development',
      ...(context ? { context: sanitizeLogContext(context) as Record<string, unknown> } : {}),
      'logging.googleapis.com/labels': {
        eventType: String(eventType),
        appEnv: process.env.APP_ENV || 'unknown',
      },
    };

    const serialized = JSON.stringify(entry);

    if (severity === 'ERROR' || severity === 'CRITICAL' || severity === 'ALERT') {
      console.error(serialized);
    } else if (severity === 'WARNING') {
      console.warn(serialized);
    } else {
      console.info(serialized);
    }

    return entry;
  }

  /**
   * Logs authentication failures (invalid credentials, expired tokens).
   */
  public static authFailure(message: string, context?: Record<string, unknown>): StructuredLogEntry {
    return CloudLogger.emit('WARNING', 'AUTH_FAILURE', message, context);
  }

  /**
   * Logs brute-force lockout events (credential lockouts, IP lockouts).
   */
  public static lockout(message: string, context?: Record<string, unknown>): StructuredLogEntry {
    return CloudLogger.emit('WARNING', 'LOCKOUT', message, context);
  }

  /**
   * Logs secondary mirror failures (Google Apps Script sync timeouts, upstream queue retries).
   */
  public static mirrorFailure(message: string, context?: Record<string, unknown>): StructuredLogEntry {
    return CloudLogger.emit('ERROR', 'MIRROR_FAILURE', message, context);
  }

  /**
   * Logs signed URL issuance for binary document uploads/downloads.
   */
  public static signedUrlIssued(message: string, context?: Record<string, unknown>): StructuredLogEntry {
    return CloudLogger.emit('INFO', 'SIGNED_URL_ISSUED', message, context);
  }

  /**
   * Generic structured info logger.
   */
  public static info(eventType: string, message: string, context?: Record<string, unknown>): StructuredLogEntry {
    return CloudLogger.emit('INFO', eventType, message, context);
  }

  /**
   * Generic structured warning logger.
   */
  public static warn(eventType: string, message: string, context?: Record<string, unknown>): StructuredLogEntry {
    return CloudLogger.emit('WARNING', eventType, message, context);
  }

  /**
   * Generic structured error logger.
   */
  public static error(eventType: string, message: string, context?: Record<string, unknown>): StructuredLogEntry {
    return CloudLogger.emit('ERROR', eventType, message, context);
  }
}

export const cloudLogger = CloudLogger;
