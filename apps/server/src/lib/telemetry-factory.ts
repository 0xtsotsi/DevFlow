/**
 * Telemetry Capture Factory - Factory for creating telemetry captures per provider
 *
 * Routes telemetry capture requests to the correct parser based on the
 * provider/engine. Provides a unified interface for capturing telemetry
 * from different AI providers.
 *
 * Features:
 * - Factory function for creating telemetry captures
 * - Automatic parser routing based on provider
 * - Support for custom parsers
 * - Fallback handling for unknown providers
 */

import type { TelemetryParser } from './telemetry.js';
import type { CapturedTelemetry, TelemetryCaptureOptions } from './telemetry.js';
import {
  createTelemetryCapture,
  createEmptyTelemetry,
  parseTelemetry as baseParseTelemetry,
} from './telemetry.js';
import { claudeTelemetryParser } from '../providers/claude-telemetry.js';
import { cursorTelemetryParser } from '../providers/cursor-telemetry.js';

/**
 * Provider parser mapping
 *
 * Maps provider IDs to their telemetry parser functions.
 */
const PROVIDER_PARSERS: Record<string, TelemetryParser> = {
  claude: claudeTelemetryParser,
  anthropic: claudeTelemetryParser,
  cursor: cursorTelemetryParser,
};

/**
 * Register a custom telemetry parser for a provider
 *
 * @param providerId Provider identifier
 * @param parser Telemetry parser function
 */
export function registerTelemetryParser(providerId: string, parser: TelemetryParser): void {
  PROVIDER_PARSERS[providerId.toLowerCase()] = parser;
}

/**
 * Get the telemetry parser for a provider
 *
 * @param providerId Provider identifier
 * @returns Telemetry parser function or undefined
 */
export function getTelemetryParser(providerId: string): TelemetryParser | undefined {
  return PROVIDER_PARSERS[providerId.toLowerCase()];
}

/**
 * Create a telemetry capture for a provider
 *
 * Routes to the correct parser based on the provider ID and creates
 * a telemetry capture object with the parsed data.
 *
 * @param engine Provider/engine ID
 * @param model Model identifier
 * @param output Raw provider output
 * @param workingDir Working directory
 * @param customParser Optional custom parser override
 * @returns Captured telemetry or null if parsing fails
 */
export function createTelemetryCapture(
  engine: string,
  model: string,
  output: string,
  workingDir: string,
  customParser?: TelemetryParser
): CapturedTelemetry | null {
  const options: TelemetryCaptureOptions = {
    provider: engine,
    model,
    workingDir,
  };

  // Use custom parser if provided
  if (customParser) {
    return baseParseTelemetry(output, options, customParser);
  }

  // Get the parser for this provider
  const parser = getTelemetryParser(engine);

  if (!parser) {
    console.warn(
      `[TelemetryFactory] No parser found for provider "${engine}", returning empty telemetry`
    );
    return createEmptyTelemetry(options);
  }

  // Parse the telemetry
  return baseParseTelemetry(output, options, parser);
}

/**
 * Create a telemetry capture with options object
 *
 * Alternative signature that takes an options object.
 *
 * @param options Capture options
 * @param output Raw provider output
 * @param customParser Optional custom parser override
 * @returns Captured telemetry or null if parsing fails
 */
export function createTelemetryCaptureFromOptions(
  options: TelemetryCaptureOptions,
  output: string,
  customParser?: TelemetryParser
): CapturedTelemetry | null {
  return createTelemetryCapture(
    options.provider,
    options.model,
    output,
    options.workingDir,
    customParser
  );
}

/**
 * Parse telemetry from output using provider routing
 *
 * @param output Raw provider output
 * @param provider Provider ID
 * @returns Parsed telemetry or null
 */
export function parseTelemetryByProvider(
  output: string,
  provider: string
): ReturnType<TelemetryParser> {
  const parser = getTelemetryParser(provider);

  if (!parser) {
    console.warn(`[TelemetryFactory] No parser found for provider "${provider}"`);
    return null;
  }

  return parser(output);
}

/**
 * Check if a provider has a registered telemetry parser
 *
 * @param providerId Provider identifier
 * @returns Whether a parser is registered
 */
export function hasTelemetryParser(providerId: string): boolean {
  return providerId.toLowerCase() in PROVIDER_PARSERS;
}

/**
 * Get all registered provider IDs
 *
 * @returns Array of provider IDs with registered parsers
 */
export function getRegisteredProviders(): string[] {
  return Object.keys(PROVIDER_PARSERS);
}

/**
 * Unregister a telemetry parser
 *
 * @param providerId Provider identifier
 * @returns Whether a parser was unregistered
 */
export function unregisterTelemetryParser(providerId: string): boolean {
  const key = providerId.toLowerCase();
  if (key in PROVIDER_PARSERS) {
    delete PROVIDER_PARSERS[key];
    return true;
  }
  return false;
}

/**
 * Clear all registered telemetry parsers
 *
 * Primarily used for testing.
 */
export function clearTelemetryParsers(): void {
  for (const key of Object.keys(PROVIDER_PARSERS)) {
    delete PROVIDER_PARSERS[key];
  }
}

/**
 * Telemetry capture class for managing captures with lifecycle
 *
 * Provides a class-based interface for creating and managing
 * telemetry captures with automatic parser selection.
 */
export class TelemetryCapture {
  private options: TelemetryCaptureOptions;
  private parser?: TelemetryParser;
  private _captured: CapturedTelemetry | null = null;

  constructor(provider: string, model: string, workingDir: string, customParser?: TelemetryParser) {
    this.options = {
      provider,
      model,
      workingDir,
    };
    this.parser = customParser;
  }

  /**
   * Parse output and capture telemetry
   *
   * @param output Raw provider output
   * @returns Captured telemetry or null
   */
  parse(output: string): CapturedTelemetry | null {
    this._captured = createTelemetryCapture(
      this.options.provider,
      this.options.model,
      output,
      this.options.workingDir,
      this.parser
    );
    return this._captured;
  }

  /**
   * Get the captured telemetry
   *
   * @returns Captured telemetry or null
   */
  get captured(): CapturedTelemetry | null {
    return this._captured;
  }

  /**
   * Reset the captured telemetry
   */
  reset(): void {
    this._captured = null;
  }

  /**
   * Get the options used for this capture
   *
   * @returns Capture options
   */
  getOptions(): TelemetryCaptureOptions {
    return { ...this.options };
  }

  /**
   * Set a custom parser
   *
   * @param parser Telemetry parser function
   */
  setParser(parser: TelemetryParser): void {
    this.parser = parser;
  }

  /**
   * Check if telemetry has been captured
   *
   * @returns Whether telemetry has been captured
   */
  isCaptured(): boolean {
    return this._captured !== null;
  }
}

/**
 * Factory function to create a TelemetryCapture instance
 *
 * @param provider Provider ID
 * @param model Model identifier
 * @param workingDir Working directory
 * @param customParser Optional custom parser
 * @returns TelemetryCapture instance
 */
export function createCapture(
  provider: string,
  model: string,
  workingDir: string,
  customParser?: TelemetryParser
): TelemetryCapture {
  return new TelemetryCapture(provider, model, workingDir, customParser);
}
