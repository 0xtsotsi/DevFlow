/**
 * Unified Telemetry Interface - Normalized telemetry across all providers
 *
 * Provides a unified format for telemetry data from different AI providers.
 * Each provider implements a parser to convert their raw output into the
 * standardized ParsedTelemetry format.
 *
 * Features:
 * - Unified ParsedTelemetry interface
 * - TelemetryParser type alias for provider parsers
 * - CapturedTelemetry wrapper for tracking
 * - Cost calculation helpers
 * - Factory function for creating telemetry captures
 */

/**
 * Unified telemetry format across all providers
 *
 * This interface represents the normalized telemetry data that can be
 * aggregated and compared across different AI providers.
 */
export interface ParsedTelemetry {
  /** Input tokens consumed */
  tokensIn: number;
  /** Output tokens generated */
  tokensOut: number;
  /** Cache read tokens (prompt caching) */
  cached: number;
  /** Estimated cost in USD */
  cost: number;
  /** Duration in milliseconds */
  duration: number;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Telemetry parser function type
 *
 * Each provider implements a parser function that takes raw provider output
 * and returns standardized telemetry or null if parsing fails.
 */
export type TelemetryParser = (output: string) => ParsedTelemetry | null;

/**
 * Captured telemetry with tracking metadata
 *
 * Wraps ParsedTelemetry with additional context about when and where
 * the telemetry was captured.
 */
export interface CapturedTelemetry {
  /** Parsed telemetry data */
  telemetry: ParsedTelemetry;
  /** Provider ID */
  provider: string;
  /** Model used */
  model: string;
  /** Working directory */
  workingDir: string;
  /** Timestamp when telemetry was captured */
  timestamp: number;
  /** Unique identifier for this capture */
  id: string;
}

/**
 * Options for creating a telemetry capture
 */
export interface TelemetryCaptureOptions {
  /** Provider ID */
  provider: string;
  /** Model ID */
  model: string;
  /** Working directory */
  workingDir: string;
  /** Optional custom ID */
  id?: string;
}

/**
 * Token pricing for different providers/models
 */
export interface TokenPricing {
  /** Cost per million input tokens */
  inputPrice: number;
  /** Cost per million output tokens */
  outputPrice: number;
  /** Cost per million cached tokens (prompt caching) */
  cachedPrice?: number;
}

/**
 * Pricing information for popular providers
 */
export const PROVIDER_PRICING: Record<string, TokenPricing> = {
  // Claude Opus 4.5
  'claude-opus-4-5-20251101': {
    inputPrice: 15.0,
    outputPrice: 75.0,
    cachedPrice: 1.5,
  },
  // Claude Sonnet 4
  'claude-sonnet-4-20250514': {
    inputPrice: 3.0,
    outputPrice: 15.0,
    cachedPrice: 0.3,
  },
  // Claude 3.5 Sonnet
  'claude-3-5-sonnet-20241022': {
    inputPrice: 3.0,
    outputPrice: 15.0,
    cachedPrice: 0.3,
  },
  // Claude Haiku 4.5
  'claude-haiku-4-5-20251001': {
    inputPrice: 0.8,
    outputPrice: 4.0,
    cachedPrice: 0.08,
  },
};

/**
 * Get pricing for a model
 *
 * @param model Model identifier
 * @returns Token pricing or default pricing
 */
export function getPricingForModel(model: string): TokenPricing {
  const normalizedModel = model.toLowerCase();

  // Direct match
  if (normalizedModel in PROVIDER_PRICING) {
    return PROVIDER_PRICING[normalizedModel];
  }

  // Prefix match for Claude models
  if (normalizedModel.startsWith('claude-opus')) {
    return PROVIDER_PRICING['claude-opus-4-5-20251101'];
  }
  if (normalizedModel.startsWith('claude-sonnet-4')) {
    return PROVIDER_PRICING['claude-sonnet-4-20250514'];
  }
  if (normalizedModel.startsWith('claude-3-5-sonnet')) {
    return PROVIDER_PRICING['claude-3-5-sonnet-20241022'];
  }
  if (normalizedModel.startsWith('claude-haiku')) {
    return PROVIDER_PRICING['claude-haiku-4-5-20251001'];
  }

  // Default pricing (conservative estimate)
  return {
    inputPrice: 3.0,
    outputPrice: 15.0,
    cachedPrice: 0.3,
  };
}

/**
 * Calculate cost from token usage
 *
 * @param tokensIn Input tokens
 * @param tokensOut Output tokens
 * @param cached Cached tokens
 * @param model Model identifier
 * @returns Cost in USD
 */
export function calculateCost(
  tokensIn: number,
  tokensOut: number,
  cached: number,
  model: string
): number {
  const pricing = getPricingForModel(model);

  const inputCost = (tokensIn - cached) * (pricing.inputPrice / 1_000_000);
  const outputCost = tokensOut * (pricing.outputPrice / 1_000_000);
  const cachedCost = cached * ((pricing.cachedPrice ?? pricing.inputPrice * 0.1) / 1_000_000);

  return inputCost + outputCost + cachedCost;
}

/**
 * Create a telemetry capture object
 *
 * @param telemetry Parsed telemetry data
 * @param options Capture options
 * @returns Captured telemetry
 */
export function createTelemetryCapture(
  telemetry: ParsedTelemetry,
  options: TelemetryCaptureOptions
): CapturedTelemetry {
  return {
    telemetry,
    provider: options.provider,
    model: options.model,
    workingDir: options.workingDir,
    timestamp: Date.now(),
    id: options.id || generateTelemetryId(),
  };
}

/**
 * Create an empty telemetry record
 *
 * Useful for when telemetry parsing fails but you want to track the attempt.
 *
 * @param options Capture options
 * @returns Captured telemetry with zero values
 */
export function createEmptyTelemetry(options: TelemetryCaptureOptions): CapturedTelemetry {
  return createTelemetryCapture(
    {
      tokensIn: 0,
      tokensOut: 0,
      cached: 0,
      cost: 0,
      duration: 0,
    },
    options
  );
}

/**
 * Generate a unique telemetry ID
 *
 * @returns Unique identifier
 */
export function generateTelemetryId(): string {
  return `tel_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Validate telemetry data
 *
 * @param telemetry Telemetry to validate
 * @returns Whether the telemetry is valid
 */
export function isValidTelemetry(telemetry: ParsedTelemetry): boolean {
  return (
    telemetry.tokensIn >= 0 &&
    telemetry.tokensOut >= 0 &&
    telemetry.cached >= 0 &&
    telemetry.cost >= 0 &&
    telemetry.duration >= 0
  );
}

/**
 * Aggregate telemetry from multiple captures
 *
 * @param captures Array of captured telemetry
 * @returns Aggregated telemetry
 */
export function aggregateTelemetry(captures: CapturedTelemetry[]): ParsedTelemetry {
  const aggregated: ParsedTelemetry = {
    tokensIn: 0,
    tokensOut: 0,
    cached: 0,
    cost: 0,
    duration: 0,
  };

  for (const capture of captures) {
    const t = capture.telemetry;
    aggregated.tokensIn += t.tokensIn;
    aggregated.tokensOut += t.tokensOut;
    aggregated.cached += t.cached;
    aggregated.cost += t.cost;
    aggregated.duration += t.duration;
  }

  return aggregated;
}

/**
 * Format telemetry for display
 *
 * @param telemetry Telemetry to format
 * @returns Formatted string
 */
export function formatTelemetry(telemetry: ParsedTelemetry): string {
  const parts: string[] = [];

  if (telemetry.tokensIn > 0) {
    parts.push(`${telemetry.tokensIn.toLocaleString()} tokens in`);
  }

  if (telemetry.tokensOut > 0) {
    parts.push(`${telemetry.tokensOut.toLocaleString()} tokens out`);
  }

  if (telemetry.cached > 0) {
    parts.push(`${telemetry.cached.toLocaleString()} cached`);
  }

  if (telemetry.cost > 0) {
    parts.push(`$${telemetry.cost.toFixed(4)}`);
  }

  if (telemetry.duration > 0) {
    const seconds = (telemetry.duration / 1000).toFixed(1);
    parts.push(`${seconds}s`);
  }

  return parts.join(', ') || 'No telemetry data';
}

/**
 * Telemetry capture factory
 *
 * Routes to the correct parser based on the provider and creates
 * a telemetry capture object.
 *
 * @param output Raw provider output
 * @param options Capture options
 * @param parser Telemetry parser function
 * @returns Captured telemetry or null if parsing fails
 */
export function parseTelemetry(
  output: string,
  options: TelemetryCaptureOptions,
  parser: TelemetryParser
): CapturedTelemetry | null {
  const telemetry = parser(output);

  if (!telemetry || !isValidTelemetry(telemetry)) {
    return null;
  }

  return createTelemetryCapture(telemetry, options);
}
