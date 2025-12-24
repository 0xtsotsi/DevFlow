/**
 * Safe JSON parsing utilities
 *
 * Provides type-safe JSON parsing with descriptive error messages.
 */

/**
 * Safely parse JSON with type checking and descriptive error messages
 *
 * @param json - The JSON string to parse
 * @param context - Context description for error messages (e.g., "listIssues")
 * @returns The parsed value as type T
 * @throws {Error} With descriptive message if parsing fails
 *
 * @example
 * ```typescript
 * const issues = safeJsonParse<BeadsIssue[]>(stdout, 'listIssues');
 * ```
 */
export function safeJsonParse<T>(json: string, context: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON response from Beads CLI (${context}): ${errorMsg}`);
  }
}

/**
 * Safely parse JSON with optional default value on error
 *
 * @param json - The JSON string to parse
 * @param defaultValue - The default value to return if parsing fails
 * @returns The parsed value or defaultValue
 *
 * @example
 * ```typescript
 * const issues = safeJsonParseOrDefault(stdout, []);
 * ```
 */
export function safeJsonParseOrDefault<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}
