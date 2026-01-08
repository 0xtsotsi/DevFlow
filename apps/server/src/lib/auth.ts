/**
 * Authentication middleware for API security
 *
 * Supports API key authentication via header or environment variable.
 * Uses constant-time comparison to prevent timing attacks.
 */

import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

// API key from environment (optional - if not set, auth is disabled)
const API_KEY = process.env.AUTOMAKER_API_KEY;

// Check if running in production
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Validate and initialize authentication on server startup
 *
 * In production mode, AUTOMAKER_API_KEY must be set.
 * Logs a warning if auth is disabled in development.
 */
export function initializeAuth(): void {
  if (isProduction && !API_KEY) {
    throw new Error('AUTOMAKER_API_KEY environment variable must be set in production mode');
  }

  if (!API_KEY) {
    console.warn('[Auth] ⚠️  Authentication DISABLED - Set AUTOMAKER_API_KEY to enable');
  } else {
    console.log('[Auth] ✓ Authentication ENABLED - API key required');
  }
}

/**
 * Timing-safe string comparison for API keys
 *
 * Prevents timing attacks where attackers can guess API keys
 * character-by-character by measuring response times.
 *
 * @param a - First string (provided API key)
 * @param b - Second string (stored API key)
 * @returns True if strings match, false otherwise
 */
function timingSafeEqualString(a: string, b: string): boolean {
  // Check length first (still timing-safe with Buffer comparison)
  if (a.length !== b.length) {
    return false;
  }

  // Use crypto.timingSafeEqual for constant-time comparison
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    // If comparison fails for any reason, return false
    return false;
  }
}

/**
 * Authentication middleware
 *
 * If AUTOMAKER_API_KEY is set, requires matching key in X-API-Key header.
 * If not set, allows all requests (development mode).
 *
 * Uses constant-time comparison to prevent timing attacks on API keys.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // If no API key is configured, allow all requests
  if (!API_KEY) {
    next();
    return;
  }

  // Check for API key in header
  const providedKey = req.headers['x-api-key'] as string | undefined;

  if (!providedKey) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Provide X-API-Key header.',
    });
    return;
  }

  // Use constant-time comparison to prevent timing attacks
  if (!timingSafeEqualString(providedKey, API_KEY)) {
    // Log failed attempt for monitoring
    console.warn(`[Auth] Failed authentication attempt from ${req.ip}`);

    res.status(403).json({
      success: false,
      error: 'Invalid API key.',
    });
    return;
  }

  next();
}

/**
 * Check if authentication is enabled
 */
export function isAuthEnabled(): boolean {
  return !!API_KEY;
}

/**
 * Get authentication status for health endpoint
 */
export function getAuthStatus(): { enabled: boolean; method: string; productionMode: boolean } {
  return {
    enabled: !!API_KEY,
    method: API_KEY ? 'api_key' : 'none',
    productionMode: isProduction,
  };
}
