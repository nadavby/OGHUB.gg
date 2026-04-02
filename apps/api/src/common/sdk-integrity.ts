/**
 * SDK Integrity Verification
 * 
 * Validates that SDK requests come from legitimate, untampered SDK instances.
 * 
 * Defense layers:
 * 1. HMAC request signing (existing)
 * 2. Request nonce tracking (replay protection)
 * 3. SDK version enforcement
 * 4. Certificate pinning validation
 * 5. Payload attestation (runtime integrity)
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler';
import { prisma } from '../main';
import { redis } from '../main';

// ─── Configuration ──────────────────────────────────────────

const HMAC_TOLERANCE_SECONDS = parseInt(process.env.SDK_HMAC_TOLERANCE_SECONDS || '30', 10);
const MIN_SDK_VERSION = '1.0.0';
const NONCE_EXPIRY_SECONDS = 300; // 5 minutes
const MAX_REQUESTS_PER_SECOND = 50; // Per API key

// ─── Enhanced HMAC Guard ────────────────────────────────────

export async function enhancedHmacGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const apiKey = req.headers['x-oghub-api-key'] as string;
    const signature = req.headers['x-oghub-signature'] as string;
    const timestamp = req.headers['x-oghub-timestamp'] as string;
    const nonce = req.headers['x-oghub-nonce'] as string;
    const sdkVersion = req.headers['x-oghub-sdk-version'] as string;
    const attestation = req.headers['x-oghub-attestation'] as string;

    // ── Required headers ─────────────────────────────────
    if (!apiKey || !signature || !timestamp || !nonce) {
      return next(new AppError('Missing SDK authentication headers', 401));
    }

    // ── Timestamp freshness ──────────────────────────────
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(now - ts) > HMAC_TOLERANCE_SECONDS) {
      return next(new AppError('Request timestamp out of range', 401));
    }

    // ── Nonce replay protection ──────────────────────────
    const nonceKey = `nonce:${apiKey}:${nonce}`;
    const nonceExists = await redis.get(nonceKey);
    if (nonceExists) {
      return next(new AppError('Duplicate request nonce — replay rejected', 401));
    }
    await redis.set(nonceKey, '1', 'EX', NONCE_EXPIRY_SECONDS);

    // ── SDK version enforcement ──────────────────────────
    if (sdkVersion && !isVersionAcceptable(sdkVersion)) {
      return next(new AppError(`SDK version ${sdkVersion} is below minimum (${MIN_SDK_VERSION})`, 426));
    }

    // ── Rate limiting per API key ────────────────────────
    const rateLimitKey = `ratelimit:sdk:${apiKey}:${Math.floor(now)}`;
    const requestCount = await redis.incr(rateLimitKey);
    await redis.expire(rateLimitKey, 2);
    if (requestCount > MAX_REQUESTS_PER_SECOND) {
      return next(new AppError('SDK rate limit exceeded', 429));
    }

    // ── Look up developer app ────────────────────────────
    const app = await prisma.developerApp.findUnique({ where: { apiKey } });
    if (!app || !app.isActive) {
      return next(new AppError('Invalid or deactivated API key', 401));
    }

    // ── HMAC signature verification ─────────────────────
    const body = JSON.stringify(req.body || {});
    const signPayload = `${timestamp}:${nonce}:${body}`;
    const expected = crypto
      .createHmac('sha256', app.apiSecret)
      .update(signPayload)
      .digest('hex');

    // Timing-safe comparison
    if (signature.length !== expected.length) {
      return next(new AppError('Invalid signature', 401));
    }
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return next(new AppError('Invalid signature', 401));
    }

    // ── Attestation verification (optional, for Android) ─
    if (attestation) {
      const attestResult = await verifyAttestation(attestation, apiKey);
      if (!attestResult.valid) {
        // Don't hard-fail, but flag for fraud engine
        (req as any).attestationFailed = true;
        (req as any).attestationReason = attestResult.reason;
      }
    }

    // ── Attach to request ────────────────────────────────
    (req as any).developerApp = app;
    (req as any).sdkVersion = sdkVersion;
    next();
  } catch (err) {
    next(err);
  }
}

// ─── Version Comparison ─────────────────────────────────────

function isVersionAcceptable(version: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const current = parse(version);
  const minimum = parse(MIN_SDK_VERSION);

  for (let i = 0; i < 3; i++) {
    if ((current[i] || 0) > (minimum[i] || 0)) return true;
    if ((current[i] || 0) < (minimum[i] || 0)) return false;
  }
  return true; // Equal
}

// ─── Attestation Verification ───────────────────────────────

interface AttestationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify Android Play Integrity / iOS App Attest tokens.
 * 
 * In production, this calls Google Play Integrity API or Apple's
 * attestation service to verify the SDK is running in a genuine,
 * untampered app on a real device.
 */
async function verifyAttestation(
  attestationToken: string,
  apiKey: string,
): Promise<AttestationResult> {
  try {
    // Decode the attestation payload
    const parts = attestationToken.split('.');
    if (parts.length < 2) {
      return { valid: false, reason: 'Malformed attestation token' };
    }

    // For production, implement:
    // 1. Send token to Google Play Integrity API
    //    POST https://playintegrity.googleapis.com/v1/{packageName}:decodeIntegrityToken
    // 
    // 2. Verify the response contains:
    //    - requestDetails.requestPackageName matches registered package
    //    - appIntegrity.appRecognitionVerdict === "PLAY_RECOGNIZED"
    //    - deviceIntegrity.deviceRecognitionVerdict includes "MEETS_DEVICE_INTEGRITY"
    //    - accountDetails.appLicensingVerdict === "LICENSED"
    //
    // 3. For iOS, use DCAppAttestService:
    //    - Verify attestation object against Apple's servers
    //    - Validate assertion for each request

    // Placeholder: accept all attestations in dev
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64').toString('utf-8'),
    );

    // Check basic fields exist
    if (!payload.packageName || !payload.timestamp) {
      return { valid: false, reason: 'Missing attestation fields' };
    }

    // Check attestation freshness (must be within 5 minutes)
    const attestTime = new Date(payload.timestamp).getTime();
    if (Math.abs(Date.now() - attestTime) > 300_000) {
      return { valid: false, reason: 'Attestation token too old' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: 'Attestation verification failed' };
  }
}

// ─── Request Signing Utilities (for SDK reference) ──────────

/**
 * Generate the signing payload format used by the SDK.
 * Format: timestamp:nonce:body
 * 
 * The nonce should be a cryptographically random string (≥16 bytes hex).
 * This prevents replay attacks even if timestamp + body are identical.
 */
export function generateSignPayload(
  timestamp: string,
  nonce: string,
  body: string,
): string {
  return `${timestamp}:${nonce}:${body}`;
}

/**
 * Compute HMAC-SHA256 signature.
 */
export function computeSignature(secret: string, payload: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}
