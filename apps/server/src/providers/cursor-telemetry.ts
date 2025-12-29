/**
 * Cursor Telemetry Parser - Parse Cursor CLI usage output
 *
 * Parses Cursor CLI output to extract token usage, costs,
 * and duration information. Cursor uses Claude under the hood,
 * so the format is similar but may have Cursor-specific differences.
 *
 * Features:
 * - Parse Cursor CLI output format
 * - Calculate cost using Claude pricing
 * - Extract duration if available
 * - Handle Cursor-specific metadata
 */

import type { ParsedTelemetry, TelemetryParser } from '../lib/telemetry.js';
import { calculateCost } from '../lib/telemetry.js';

/**
 * Cursor-specific metadata that may be in output
 */
interface CursorMetadata {
  /** Cursor model used */
  model?: string;
  /** Request ID */
  requestId?: string;
  /** Whether streaming was used */
  streaming?: boolean;
  [key: string]: unknown;
}

/**
 * Parse Cursor CLI JSON output
 *
 * Cursor's output format is similar to Claude's but may have
 * additional Cursor-specific fields.
 *
 * @param output Raw Cursor CLI output
 * @param model Model identifier for cost calculation
 * @returns Parsed telemetry or null
 */
function parseCursorJsonOutput(output: string, model: string): ParsedTelemetry | null {
  try {
    const lines = output.split('\n').filter((line) => line.trim().length > 0);
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCached = 0;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        // Check for Cursor-specific format
        if (parsed.cursor?.usage) {
          totalTokensIn += parsed.cursor.usage.input_tokens || 0;
          totalTokensOut += parsed.cursor.usage.output_tokens || 0;
          totalCached += parsed.cursor.usage.cache_read_tokens || 0;
        }
        // Check for standard Claude format (Cursor uses Claude)
        else if (parsed.usage) {
          totalTokensIn += parsed.usage.input_tokens || 0;
          totalTokensOut += parsed.usage.output_tokens || 0;
          totalCached += parsed.usage.cache_read_tokens || 0;
        }
        // Check for direct token counts
        else if (parsed.tokens || parsed.token_count) {
          totalTokensIn += parsed.tokens?.input || parsed.token_count?.input || 0;
          totalTokensOut += parsed.tokens?.output || parsed.token_count?.output || 0;
          totalCached += parsed.tokens?.cached || parsed.token_count?.cached || 0;
        }
      } catch {
        // Skip lines that aren't valid JSON
      }
    }

    if (totalTokensIn === 0 && totalTokensOut === 0) {
      return null;
    }

    const cost = calculateCost(totalTokensIn, totalTokensOut, totalCached, model);

    return {
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      cached: totalCached,
      cost,
      duration: 0,
    };
  } catch {
    return null;
  }
}

/**
 * Parse Cursor CLI text format
 *
 * Cursor may output text like:
 * - "Cursor used 1234 tokens"
 * - "Request completed: 500 in, 300 out"
 *
 * @param output Output text
 * @returns Token counts or null
 */
function parseCursorTextFormat(output: string): { tokensIn: number; tokensOut: number } | null {
  const textPatterns = [
    // Cursor-specific patterns
    /cursor\s+(?:used|consumed)[:\s]+(\d+)\s*tokens?/i,
    /cursor\s+request[:\s]*(\d+)\s*in,\s*(\d+)\s*out/i,
    /request\s+completed[:\s]*(\d+)\s*in,\s*(\d+)\s*out/i,
    // Generic patterns
    /tokens?\s*(?:in|input)?:?\s*(\d+)/i,
    /tokens?\s*(?:out|output)?:?\s*(\d+)/i,
  ];

  let tokensIn = 0;
  let tokensOut = 0;

  for (const pattern of textPatterns) {
    const match = output.match(pattern);
    if (match) {
      // First pattern type captures both in/out
      if (match.length >= 3) {
        tokensIn = parseInt(match[1], 10);
        tokensOut = parseInt(match[2], 10);
      } else {
        // Determine if this is input or output based on pattern
        if (pattern.source.includes('in') || pattern.source.includes('input')) {
          tokensIn = parseInt(match[1], 10);
        } else if (pattern.source.includes('out') || pattern.source.includes('output')) {
          tokensOut = parseInt(match[1], 10);
        } else {
          // Ambiguous, assume input
          tokensIn = parseInt(match[1], 10);
        }
      }
    }
  }

  if (tokensIn === 0 && tokensOut === 0) {
    return null;
  }

  return { tokensIn, tokensOut };
}

/**
 * Extract Cursor model from output
 *
 * @param output Raw output
 * @returns Model identifier
 */
function extractCursorModel(output: string): string {
  // Cursor-specific model mentions
  const modelPatterns = [
    /cursor\s+model[:\s]+([a-z0-9.-]+)/i,
    /using\s+cursor\s+([a-z0-9.-]+)/i,
    /model[:\s]+(cursor-[a-z0-9.-]+)/i,
    // Fall back to Claude model detection
    /model[:\s]+(claude-[a-z0-9-]+)/i,
  ];

  for (const pattern of modelPatterns) {
    const match = output.match(pattern);
    if (match) {
      const model = match[1];
      // Normalize cursor- prefixed models to their claude equivalents
      if (model.startsWith('cursor-')) {
        return model.replace('cursor-', 'claude-');
      }
      return model;
    }
  }

  // Default to Sonnet 4 (Cursor's default)
  return 'claude-sonnet-4-20250514';
}

/**
 * Extract Cursor metadata from output
 *
 * @param output Raw output
 * @returns Cursor metadata
 */
function extractCursorMetadata(output: string): CursorMetadata {
  const metadata: CursorMetadata = {};

  // Extract request ID
  const requestIdMatch = output.match(/request[_\s]?id[:\s]+([a-z0-9-]+)/i);
  if (requestIdMatch) {
    metadata.requestId = requestIdMatch[1];
  }

  // Check for streaming indicator
  metadata.streaming = /streaming|stream/i.test(output);

  // Extract model
  metadata.model = extractCursorModel(output);

  return metadata;
}

/**
 * Extract duration from Cursor output
 *
 * @param output Raw output
 * @returns Duration in milliseconds
 */
function extractCursorDuration(output: string): number {
  // Cursor may report duration similar to Claude
  const durationPatterns = [
    /duration[:\s]+(\d+(?:\.\d+)?)\s*(s|seconds?|ms|milliseconds?)/i,
    /completed\s+in[:\s]+(\d+(?:\.\d+)?)\s*(s|seconds?|ms|milliseconds?)/i,
    /took[:\s]+(\d+(?:\.\d+)?)\s*(s|seconds?|ms|milliseconds?)/i,
    /time[:\s]+(\d+(?:\.\d+)?)\s*(s|seconds?|ms|milliseconds?)/i,
  ];

  for (const pattern of durationPatterns) {
    const match = output.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2]?.toLowerCase() || '';

      if (unit.startsWith('ms') || unit.startsWith('millis')) {
        return Math.round(value);
      }
      // Default to seconds
      return Math.round(value * 1000);
    }
  }

  return 0;
}

/**
 * Cursor telemetry parser factory
 *
 * Creates a parser function for Cursor output.
 *
 * @param model Model identifier for cost calculation (auto-detected if not provided)
 * @returns Telemetry parser function
 */
export function createCursorTelemetryParser(model?: string): TelemetryParser {
  return (output: string): ParsedTelemetry | null => {
    const detectedModel = model || extractCursorModel(output);
    const metadata = extractCursorMetadata(output);

    // Try JSON format first
    const jsonResult = parseCursorJsonOutput(output, detectedModel);
    if (jsonResult) {
      const duration = extractCursorDuration(output);
      if (duration > 0) {
        jsonResult.duration = duration;
      }
      if (Object.keys(metadata).length > 0) {
        jsonResult.metadata = metadata;
      }
      return jsonResult;
    }

    // Fall back to text format
    const textResult = parseCursorTextFormat(output);
    if (textResult) {
      const duration = extractCursorDuration(output);
      const cost = calculateCost(textResult.tokensIn, textResult.tokensOut, 0, detectedModel);

      const result: ParsedTelemetry = {
        ...textResult,
        cached: 0,
        cost,
        duration,
      };

      if (Object.keys(metadata).length > 0) {
        result.metadata = metadata;
      }

      return result;
    }

    // No telemetry found
    return null;
  };
}

/**
 * Default Cursor telemetry parser with auto model detection
 */
export const cursorTelemetryParser = createCursorTelemetryParser();

/**
 * Parse Cursor telemetry with model auto-detection
 *
 * @param output Raw Cursor CLI output
 * @returns Parsed telemetry or null
 */
export function parseCursorTelemetry(output: string): ParsedTelemetry | null {
  return cursorTelemetryParser(output);
}
