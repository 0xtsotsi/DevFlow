/**
 * Claude Telemetry Parser - Parse Claude SDK usage output
 *
 * Parses Claude Agent SDK output to extract token usage, costs,
 * and duration information. Handles multiple output formats from
 * the Claude SDK.
 *
 * Features:
 * - Parse Claude SDK usage JSON
 * - Calculate cost using Claude pricing
 * - Extract duration if available
 * - Handle multiple output formats
 */

import type { ParsedTelemetry, TelemetryParser } from '../lib/telemetry.js';
import { calculateCost } from '../lib/telemetry.js';

/**
 * Claude SDK usage format
 */
interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
}

/**
 * Claude SDK message format
 */
interface ClaudeMessage {
  type: string;
  usage?: ClaudeUsage;
  result?: string;
}

/**
 * Parse Claude SDK JSON output
 *
 * @param output Raw Claude SDK output
 * @param model Model identifier for cost calculation
 * @returns Parsed telemetry or null
 */
function parseClaudeJsonOutput(output: string, model: string): ParsedTelemetry | null {
  try {
    const lines = output.split('\n').filter((line) => line.trim().length > 0);
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCached = 0;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as ClaudeMessage | ClaudeUsage;

        // Check if it's a message with usage
        if ('type' in parsed && parsed.usage) {
          totalTokensIn += parsed.usage.input_tokens || 0;
          totalTokensOut += parsed.usage.output_tokens || 0;
          totalCached += parsed.usage.cache_read_tokens || 0;
        }
        // Check if it's a direct usage object
        else if ('input_tokens' in parsed) {
          totalTokensIn += parsed.input_tokens || 0;
          totalTokensOut += parsed.output_tokens || 0;
          totalCached += parsed.cache_read_tokens || 0;
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
      duration: 0, // Duration not available in JSON output
    };
  } catch {
    return null;
  }
}

/**
 * Parse usage from text format (e.g., "Used 1234 tokens")
 *
 * @param output Output text
 * @returns Token counts or null
 */
function parseTextFormat(output: string): { tokensIn: number; tokensOut: number } | null {
  // Look for patterns like "Used 1234 tokens" or "Tokens: 1234"
  const tokenPatterns = [
    /(?:used|tokens?):?\s*(\d+)\s*tokens?/i,
    /tokens?\s*(?:in|input)?:?\s*(\d+)/i,
    /(\d+)\s*tokens?\s*(?:in|input)/i,
  ];

  let tokensIn = 0;
  let tokensOut = 0;

  for (const pattern of tokenPatterns) {
    const match = output.match(pattern);
    if (match) {
      tokensIn = parseInt(match[1], 10);
      break;
    }
  }

  const outputPatterns = [
    /tokens?\s*(?:out|output)?:?\s*(\d+)/i,
    /(\d+)\s*tokens?\s*(?:out|output)/i,
  ];

  for (const pattern of outputPatterns) {
    const match = output.match(pattern);
    if (match) {
      tokensOut = parseInt(match[1], 10);
      break;
    }
  }

  if (tokensIn === 0 && tokensOut === 0) {
    return null;
  }

  return { tokensIn, tokensOut };
}

/**
 * Extract model from output
 *
 * @param output Raw output
 * @returns Model identifier or default
 */
function extractModel(output: string): string {
  // Look for model mentions
  const modelPatterns = [
    /model[:\s]+(claude-[a-z0-9-]+)/i,
    /using\s+(claude-[a-z0-9-]+)/i,
    /(?:model|engine)[:\s]+([a-z]+-[a-z0-9.-]+)/i,
  ];

  for (const pattern of modelPatterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // Default to Sonnet 4 if not found
  return 'claude-sonnet-4-20250514';
}

/**
 * Extract duration from output
 *
 * @param output Raw output
 * @returns Duration in milliseconds
 */
function extractDuration(output: string): number {
  // Look for duration mentions like "Duration: 1.5s" or "Took 1234ms"
  const durationPatterns = [
    /duration[:\s]+(\d+(?:\.\d+)?)\s*s/i,
    /took[:\s]+(\d+(?:\.\d+)?)\s*s/i,
    /(\d+(?:\.\d+)?)\s*seconds?/i,
    /(\d+)\s*ms/i,
  ];

  for (const pattern of durationPatterns) {
    const match = output.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      // If the pattern captured 'ms' or the value is large, treat as milliseconds
      if (pattern.source.includes('ms') || value > 100) {
        return Math.round(value);
      }
      // Otherwise treat as seconds
      return Math.round(value * 1000);
    }
  }

  return 0;
}

/**
 * Claude telemetry parser factory
 *
 * Creates a parser function for a specific model.
 *
 * @param model Model identifier for cost calculation
 * @returns Telemetry parser function
 */
export function createClaudeTelemetryParser(
  model: string = 'claude-sonnet-4-20250514'
): TelemetryParser {
  return (output: string): ParsedTelemetry | null => {
    // Try JSON format first
    const jsonResult = parseClaudeJsonOutput(output, model);
    if (jsonResult) {
      // Add duration if available
      const duration = extractDuration(output);
      if (duration > 0) {
        jsonResult.duration = duration;
      }
      return jsonResult;
    }

    // Fall back to text format
    const textResult = parseTextFormat(output);
    if (textResult) {
      const duration = extractDuration(output);
      const cost = calculateCost(textResult.tokensIn, textResult.tokensOut, 0, model);

      return {
        ...textResult,
        cached: 0,
        cost,
        duration,
      };
    }

    // No telemetry found
    return null;
  };
}

/**
 * Default Claude telemetry parser using Sonnet 4 model
 */
export const claudeTelemetryParser = createClaudeTelemetryParser();

/**
 * Parse Claude telemetry with model auto-detection
 *
 * @param output Raw Claude SDK output
 * @returns Parsed telemetry or null
 */
export function parseClaudeTelemetry(output: string): ParsedTelemetry | null {
  const model = extractModel(output);
  const parser = createClaudeTelemetryParser(model);
  return parser(output);
}

/**
 * Extract usage from a Claude SDK result message
 *
 * @param message Claude SDK message
 * @returns Token usage or null
 */
export function extractUsageFromMessage(message: ClaudeMessage): ClaudeUsage | null {
  if (!message.usage) {
    return null;
  }

  return {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_read_tokens: message.usage.cache_read_tokens || 0,
  };
}
