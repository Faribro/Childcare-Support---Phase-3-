const REDACTED_KEY_PATTERN =
  /secret|token|key|password|authorization|cookie|aadhaar|bankaccount|ifsc|signaturedataurl|photourl|lat|lng|latitude|longitude/i;

export function sanitizeLogContext(input: unknown, depth = 0): unknown {
  if (depth > 3) return '[truncated]';
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    if (input.startsWith('data:')) return '[redacted-data-url]';
    return input.length > 300 ? `${input.slice(0, 300)}...` : input;
  }
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.slice(0, 20).map((item) => sanitizeLogContext(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (REDACTED_KEY_PATTERN.test(k)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = sanitizeLogContext(v, depth + 1);
    }
  }
  return out;
}

export function logServerError(
  route: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const errObj = error instanceof Error ? error : null;
  const payload = {
    level: 'error',
    timestamp: new Date().toISOString(),
    route,
    name: errObj?.name || 'Error',
    message: errObj?.message || String(error || 'Unknown error'),
    ...(context ? { context: sanitizeLogContext(context) } : {}),
  };
  console.error(JSON.stringify(payload));
}

export function logServerWarn(
  route: string,
  message: string,
  context?: Record<string, unknown>
): void {
  const payload = {
    level: 'warn',
    timestamp: new Date().toISOString(),
    route,
    message,
    ...(context ? { context: sanitizeLogContext(context) } : {}),
  };
  console.warn(JSON.stringify(payload));
}
