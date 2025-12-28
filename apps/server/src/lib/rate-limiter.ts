/**
 * Rate limiting utilities for API security
 *
 * Provides rate limiters to prevent abuse and brute force attacks.
 */

import rateLimit from 'express-rate-limit';

// ============================================================================
// Standard API Rate Limiter
// ============================================================================

/**
 * Standard API rate limiter
 *
 * Limits each IP to 100 requests per 15-minute window.
 * Suitable for general API endpoints.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// ============================================================================
// Health Endpoint Rate Limiter
// ============================================================================

/**
 * Health endpoint rate limiter
 *
 * Limits each IP to 10 requests per 1-minute window.
 * Prevents health endpoint abuse while allowing monitoring.
 */
export const healthLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    success: false,
    error: 'Too many health check requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Strict Rate Limiter (for sensitive operations)
// ============================================================================

/**
 * Strict rate limiter for sensitive operations
 *
 * Limits each IP to 5 requests per 1-minute window.
 * Use for authentication, settings changes, etc.
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Beads-specific Rate Limiter
// ============================================================================

/**
 * Beads API rate limiter
 *
 * Limits each IP to 200 requests per 15-minute window.
 * Beads operations can be frequent, so we allow more requests.
 */
export const beadsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
