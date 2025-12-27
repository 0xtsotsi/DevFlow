/**
 * Provider module exports
 *
 * Centralizes all provider-related exports for easy importing.
 */

// Base provider
export { BaseProvider } from './base-provider.js';

// Concrete providers
export { ClaudeProvider } from './claude-provider.js';
export { CursorProvider } from './cursor-provider.js';

// Factory
export { ProviderFactory } from './provider-factory.js';

// Registry
export { EngineRegistry, getProvider, getAllProviders, getPrimaryProvider } from './registry.js';
export type {
  ProviderMetadata,
  TelemetryParser,
  ParsedTelemetry,
  RegisterCallback,
} from './registry.js';

// Capability probing
export { ProviderCapabilityProbe, capabilityProbe } from './capability-probe.js';
export type {
  ProviderCapability,
  ProbeResult,
  ProviderLimits,
  AuthMethod,
} from './capability-probe.js';

// Auth cache
export { AuthCache, authCache } from './auth-cache.js';
export type { AuthCacheStats } from './auth-cache.js';

// Telemetry parsers
export {
  claudeTelemetryParser,
  createClaudeTelemetryParser,
  parseClaudeTelemetry,
} from './claude-telemetry.js';
export {
  cursorTelemetryParser,
  createCursorTelemetryParser,
  parseCursorTelemetry,
} from './cursor-telemetry.js';

// Types
export type {
  ProviderConfig,
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ValidationResult,
  ConversationMessage,
  ContentBlock,
} from './types.js';
