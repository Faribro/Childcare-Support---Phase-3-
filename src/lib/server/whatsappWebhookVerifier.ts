import crypto from 'crypto';

export interface HandshakeVerificationResult {
  isValid: boolean;
  challenge?: string;
  statusCode: number;
  error?: string;
}

export interface SignatureVerificationResult {
  isValid: boolean;
  statusCode: number;
  error?: string;
}

/**
 * Validates Meta's webhook verification GET handshake.
 *
 * Requirements from Meta:
 * - hub.mode must equal 'subscribe'
 * - hub.verify_token must match the server-configured verify token
 * - hub.challenge is returned as-is to confirm endpoint ownership
 */
export function verifyWebhookHandshake(
  mode: string | null,
  verifyToken: string | null,
  challenge: string | null,
  expectedToken: string
): HandshakeVerificationResult {
  if (!mode || !verifyToken || !challenge) {
    return {
      isValid: false,
      statusCode: 400,
      error: 'Missing required handshake parameters: hub.mode, hub.verify_token, and hub.challenge are required.',
    };
  }

  if (mode.length > 64) {
    return {
      isValid: false,
      statusCode: 400,
      error: 'hub.mode parameter exceeds maximum allowed length.',
    };
  }

  if (verifyToken.length > 256) {
    return {
      isValid: false,
      statusCode: 400,
      error: 'hub.verify_token parameter exceeds maximum allowed length.',
    };
  }

  if (challenge.length > 512) {
    return {
      isValid: false,
      statusCode: 400,
      error: 'hub.challenge parameter exceeds maximum allowed length.',
    };
  }

  if (mode !== 'subscribe') {
    return {
      isValid: false,
      statusCode: 403,
      error: `Invalid hub.mode: expected 'subscribe', received '${mode}'.`,
    };
  }

  if (!expectedToken) {
    return {
      isValid: false,
      statusCode: 500,
      error: 'Server configuration error: WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured.',
    };
  }

  // Constant-time comparison to prevent timing attacks
  const tokenBuf = Buffer.from(verifyToken, 'utf-8');
  const expectedBuf = Buffer.from(expectedToken, 'utf-8');

  if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    return {
      isValid: false,
      statusCode: 403,
      error: 'Invalid hub.verify_token.',
    };
  }

  return {
    isValid: true,
    challenge,
    statusCode: 200,
  };
}

/**
 * Validates the HMAC-SHA256 signature on incoming Meta webhook POST requests.
 *
 * Meta sends an X-Hub-Signature-256 header in the format:
 *   sha256=<hex_encoded_hmac>
 *
 * The HMAC is computed over the raw request payload using the Meta App Secret.
 * Uses crypto.timingSafeEqual to prevent side-channel timing attacks.
 */
export function verifyWebhookSignature(
  rawBuffer: Buffer,
  signatureHeader: string | null,
  appSecret: string
): SignatureVerificationResult {
  if (!appSecret) {
    return {
      isValid: false,
      statusCode: 500,
      error: 'Server configuration error: META_APP_SECRET is not configured.',
    };
  }

  if (!signatureHeader) {
    return {
      isValid: false,
      statusCode: 401,
      error: 'Missing X-Hub-Signature-256 header.',
    };
  }

  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) {
    return {
      isValid: false,
      statusCode: 401,
      error: 'Malformed X-Hub-Signature-256 header: must start with sha256=.',
    };
  }

  const providedHash = signatureHeader.slice(prefix.length).trim();
  if (!/^[0-9a-fA-F]{64}$/.test(providedHash)) {
    return {
      isValid: false,
      statusCode: 401,
      error: 'Malformed X-Hub-Signature-256 header: signature must be a 64-character hexadecimal string.',
    };
  }

  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(rawBuffer)
    .digest('hex');

  const providedBuf = Buffer.from(providedHash.toLowerCase(), 'hex');
  const expectedBuf = Buffer.from(expectedHash.toLowerCase(), 'hex');

  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return {
      isValid: false,
      statusCode: 401,
      error: 'Invalid X-Hub-Signature-256 signature.',
    };
  }

  return {
    isValid: true,
    statusCode: 200,
  };
}
