/**
 * Beads Memory Service
 *
 * Queries past Beads issues as context for agents.
 * Provides semantic search, decision extraction, and token estimation
 * to give agents relevant historical context before starting work.
 *
 * HYBRID-M2: Core component of autonomous agent memory system.
 */

import { BeadsService } from './beads-service.js';
import { MCPBridge } from '../lib/mcp-bridge.js';
import type { BeadsIssue } from '@automaker/types';

/**
 * Memory context returned to agents
 */
export interface MemoryContext {
  /** Related bugs that might impact current task */
  relatedBugs: BeadsIssue[];
  /** Related features that provide context */
  relatedFeatures: BeadsIssue[];
  /** Past decisions extracted from closed issues */
  pastDecisions: Array<{ issue: BeadsIssue; decision: string }>;
  /** Issues that are currently blocking this task */
  blockedBy: BeadsIssue[];
  /** Issues semantically similar to current task */
  similarIssues: BeadsIssue[];
  /** AI-generated summary of context */
  summary: string;
  /** Estimated token count for this context */
  totalTokenEstimate: number;
}

/**
 * Options for querying memory
 */
export interface MemoryQueryOptions {
  /** Maximum results to return (default: 10) */
  maxResults?: number;
  /** Include closed issues (default: true) */
  includeClosed?: boolean;
  /** Include in-progress issues (default: true) */
  includeInProgress?: boolean;
  /** Minimum similarity score 0-1 (default: 0.3) */
  minSimilarity?: number;
}

/**
 * Beads Memory Service
 *
 * Provides agents with historical context from Beads issues.
 * Uses caching for performance and graceful degradation when MCP unavailable.
 */
export class BeadsMemoryService {
  private beadsService: BeadsService;
  private mcpBridge: MCPBridge;
  private cache: Map<string, { context: MemoryContext; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;

  constructor(beadsService: BeadsService, mcpBridge: MCPBridge) {
    this.beadsService = beadsService;
    this.mcpBridge = mcpBridge;
  }

  /**
   * Query relevant context for a task
   *
   * @param projectPath - Path to project with Beads database
   * @param currentTask - Description of current task
   * @param options - Query options
   * @returns Memory context with relevant issues
   */
  async queryRelevantContext(
    projectPath: string,
    currentTask: string,
    options: MemoryQueryOptions = {}
  ): Promise<MemoryContext> {
    // Check cache first
    const cacheKey = this.hashQuery(projectPath, currentTask, options);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('[BeadsMemory] Cache hit for query:', currentTask.slice(0, 50));
      return cached.context;
    }

    console.log('[BeadsMemory] Cache miss, querying context for:', currentTask.slice(0, 50));

    // Extract keywords from task
    const keywords = this.extractKeywords(currentTask);
    console.log('[BeadsMemory] Extracted keywords:', keywords);

    // Search issues by keywords
    const maxResults = options.maxResults || 10;

    let allIssues: BeadsIssue[] = [];
    for (const keyword of keywords.slice(0, 2)) {
      // Search with each keyword to get broader results
      const results = await this.beadsService.searchIssues(projectPath, keyword, {
        limit: maxResults * 2, // Get more to filter later
      });
      allIssues = allIssues.concat(results);
    }

    // Deduplicate by ID
    const uniqueIssues = Array.from(new Map(allIssues.map((issue) => [issue.id, issue])).values());

    console.log('[BeadsMemory] Found', uniqueIssues.length, 'issues before filtering');

    // Filter by status based on options
    const includeClosed = options.includeClosed !== false;
    const includeInProgress = options.includeInProgress !== false;

    const filteredIssues = uniqueIssues.filter((issue) => {
      // Always include open and blocked
      if (issue.status === 'open' || issue.status === 'blocked') {
        return true;
      }
      // Include closed if option is set
      if (issue.status === 'closed' && includeClosed) {
        return true;
      }
      // Include in_progress if option is set
      if (issue.status === 'in_progress' && includeInProgress) {
        return true;
      }
      return false;
    });

    console.log('[BeadsMemory] Filtered to', filteredIssues.length, 'issues');

    // Categorize issues
    const relatedBugs = filteredIssues.filter((i) => i.type === 'bug').slice(0, maxResults);

    const relatedFeatures = filteredIssues
      .filter((i) => i.type === 'feature' || i.type === 'epic')
      .slice(0, maxResults);

    // Find similar issues with semantic search
    const minSimilarity = options.minSimilarity ?? 0.3;
    const similarIssues = this.findSimilarIssues(currentTask, filteredIssues, minSimilarity);

    // Extract decisions from closed issues
    const pastDecisions = await this.extractDecisions(
      filteredIssues.filter((i) => i.status === 'closed')
    );

    // Find blocking issues
    const blockedBy = await this.findBlockingIssues(projectPath, filteredIssues);

    // Build context
    const context: MemoryContext = {
      relatedBugs,
      relatedFeatures,
      pastDecisions,
      blockedBy,
      similarIssues,
      summary: '', // Will be filled by generateSummary
      totalTokenEstimate: 0,
    };

    // Estimate tokens
    context.totalTokenEstimate = this.estimateTokens(context);

    // Generate summary
    context.summary = await this.generateSummary(currentTask, context);

    // Cache the result
    this.cache.set(cacheKey, { context, timestamp: Date.now() });

    // Cleanup old cache entries if needed
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      this.cleanupCache();
    }

    console.log('[BeadsMemory] Returning context with', context.totalTokenEstimate, 'tokens');

    return context;
  }

  /**
   * Find issues similar to a task using keyword matching
   *
   * @param task - Current task description
   * @param issues - Issues to search through
   * @param minSimilarity - Minimum similarity score (0-1)
   * @returns Similar issues sorted by score
   */
  private findSimilarIssues(
    task: string,
    issues: BeadsIssue[],
    minSimilarity: number
  ): BeadsIssue[] {
    const taskKeywords = this.extractKeywords(task);
    const scored = issues.map((issue) => {
      const titleKeywords = this.extractKeywords(issue.title);
      const descKeywords = this.extractKeywords(issue.description);

      // Count keyword matches
      let matches = 0;
      for (const taskKeyword of taskKeywords) {
        if (titleKeywords.includes(taskKeyword)) {
          matches += 0.3; // Title matches weighted higher
        }
        if (descKeywords.includes(taskKeyword)) {
          matches += 0.2; // Description matches
        }
      }

      return { issue, score: matches };
    });

    // Filter by threshold and sort by score
    return scored
      .filter((s) => s.score >= minSimilarity)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5) // Top 5 similar issues
      .map((s) => s.issue);
  }

  /**
   * Extract past decisions from closed issues
   *
   * Looks for decision markers in issue descriptions:
   * - "decision:"
   * - "resolution:"
   * - "solution:"
   *
   * @param issues - Closed issues to search
   * @returns Array of decisions with source issues
   */
  private async extractDecisions(
    issues: BeadsIssue[]
  ): Promise<Array<{ issue: BeadsIssue; decision: string }>> {
    const decisions: Array<{ issue: BeadsIssue; decision: string }> = [];

    for (const issue of issues) {
      const lines = issue.description.split('\n');

      // Look for decision markers
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (
          line.includes('decision:') ||
          line.includes('resolution:') ||
          line.includes('solution:')
        ) {
          // Extract the decision (rest of line + next line if present)
          let decision = lines[i].split(/decision:|resolution:|solution:/i)[1]?.trim();
          if (!decision && i + 1 < lines.length) {
            decision = lines[i + 1].trim();
          }

          if (decision && decision.length > 10) {
            decisions.push({
              issue,
              decision: decision.slice(0, 500), // Limit decision length
            });
            break; // Only take first decision per issue
          }
        }
      }

      if (decisions.length >= 5) {
        break; // Max 5 decisions
      }
    }

    return decisions;
  }

  /**
   * Find issues that are blocking current work
   *
   * @param projectPath - Path to project
   * @param issues - Issues to check
   * @returns Issues with open blockers
   */
  private async findBlockingIssues(
    projectPath: string,
    issues: BeadsIssue[]
  ): Promise<BeadsIssue[]> {
    const blocking: BeadsIssue[] = [];

    for (const issue of issues) {
      try {
        const deps = await this.beadsService.getDependencies(projectPath, issue.id);
        if (deps.blockedBy.length > 0) {
          // Check if blockers are still open
          const openBlockers = await Promise.all(
            deps.blockedBy.map(async (blockerId) => {
              try {
                const blocker = await this.beadsService.getIssue(projectPath, blockerId);
                return blocker && (blocker.status === 'open' || blocker.status === 'in_progress');
              } catch {
                return false;
              }
            })
          );

          if (openBlockers.some((isOpen) => isOpen)) {
            blocking.push(issue);
          }
        }
      } catch (error) {
        console.warn('[BeadsMemory] Failed to check blockers for', issue.id, error);
      }

      if (blocking.length >= 5) {
        break; // Max 5 blocking issues
      }
    }

    return blocking;
  }

  /**
   * Generate a summary of the memory context
   *
   * Tries to use Exa MCP for web search if available,
   * otherwise falls back to basic summary.
   *
   * @param task - Current task
   * @param context - Memory context
   * @returns Formatted summary
   */
  private async generateSummary(task: string, context: MemoryContext): Promise<string> {
    // Try to use Exa MCP for web search if available
    if (this.mcpBridge.isAvailable()) {
      try {
        const keywords = this.extractKeywords(task).slice(0, 3);
        const searchQuery = `${keywords.join(' ')} best practices implementation`;

        const result = await this.mcpBridge.callTool('mcp__exa__web_search_exa', {
          query: searchQuery,
          numResults: 3,
          type: 'auto',
        });

        if (result.success && result.data) {
          const webResults = result.data as Array<{ title: string; url: string; snippet?: string }>;
          return this.formatSummaryWithWebSearch(task, context, webResults);
        }
      } catch (error) {
        console.warn('[BeadsMemory] Exa MCP search failed, falling back to basic summary:', error);
      }
    }

    // Fall back to basic summary
    return this.formatBasicSummary(task, context);
  }

  /**
   * Format summary with web search results
   *
   * @param task - Current task
   * @param context - Memory context
   * @param webResults - Web search results from Exa
   * @returns Formatted summary
   */
  private formatSummaryWithWebSearch(
    task: string,
    context: MemoryContext,
    webResults: Array<{ title: string; url: string; snippet?: string }>
  ): string {
    const parts: string[] = [];

    parts.push(`## Memory Context for: "${task.slice(0, 100)}"\n`);

    // Related Bugs
    if (context.relatedBugs.length > 0) {
      parts.push(`### Related Bugs (${context.relatedBugs.length})`);
      for (const bug of context.relatedBugs.slice(0, 5)) {
        parts.push(`- **${bug.id}**: ${bug.title} (${bug.status})`);
      }
      parts.push('');
    }

    // Related Features
    if (context.relatedFeatures.length > 0) {
      parts.push(`### Related Features (${context.relatedFeatures.length})`);
      for (const feature of context.relatedFeatures.slice(0, 5)) {
        parts.push(`- **${feature.id}**: ${feature.title} (${feature.status})`);
      }
      parts.push('');
    }

    // Past Decisions
    if (context.pastDecisions.length > 0) {
      parts.push(`### Past Decisions`);
      for (const { issue, decision } of context.pastDecisions) {
        parts.push(`- ${decision} (${issue.id})`);
      }
      parts.push('');
    }

    // Web Search Results
    if (webResults.length > 0) {
      parts.push(`### Relevant Resources`);
      for (const result of webResults) {
        parts.push(`- [${result.title}](${result.url})`);
        if (result.snippet) {
          parts.push(`  > ${result.snippet.slice(0, 200)}`);
        }
      }
      parts.push('');
    }

    // Token estimate warning
    if (context.totalTokenEstimate > 15000) {
      parts.push(
        `⚠️ **Warning**: Context is large (${context.totalTokenEstimate} tokens). Consider filtering.`
      );
    }

    return parts.join('\n');
  }

  /**
   * Format basic summary without web search
   *
   * @param task - Current task
   * @param context - Memory context
   * @returns Formatted summary
   */
  private formatBasicSummary(task: string, context: MemoryContext): string {
    const parts: string[] = [];

    parts.push(`## Memory Context for: "${task.slice(0, 100)}"\n`);

    // Related Bugs
    if (context.relatedBugs.length > 0) {
      parts.push(`### Related Bugs (${context.relatedBugs.length})`);
      for (const bug of context.relatedBugs.slice(0, 5)) {
        parts.push(`- **${bug.id}**: ${bug.title} (${bug.status})`);
      }
      parts.push('');
    }

    // Related Features
    if (context.relatedFeatures.length > 0) {
      parts.push(`### Related Features (${context.relatedFeatures.length})`);
      for (const feature of context.relatedFeatures.slice(0, 5)) {
        parts.push(`- **${feature.id}**: ${feature.title} (${feature.status})`);
      }
      parts.push('');
    }

    // Past Decisions
    if (context.pastDecisions.length > 0) {
      parts.push(`### Past Decisions`);
      for (const { issue, decision } of context.pastDecisions) {
        parts.push(`- ${decision} (${issue.id})`);
      }
      parts.push('');
    }

    // Blocking Issues
    if (context.blockedBy.length > 0) {
      parts.push(`### Blocking Issues (${context.blockedBy.length})`);
      for (const blocker of context.blockedBy) {
        parts.push(
          `- **${blocker.id}**: ${blocker.title} (has ${blocker.dependencies?.length || 0} blockers)`
        );
      }
      parts.push('');
    }

    // Similar Issues
    if (context.similarIssues.length > 0) {
      parts.push(`### Similar Issues (${context.similarIssues.length})`);
      for (const similar of context.similarIssues) {
        parts.push(`- **${similar.id}**: ${similar.title} (${similar.type})`);
      }
      parts.push('');
    }

    // Token estimate warning
    if (context.totalTokenEstimate > 15000) {
      parts.push(
        `⚠️ **Warning**: Context is large (${context.totalTokenEstimate} tokens). Consider filtering.`
      );
    }

    return parts.join('\n');
  }

  /**
   * Extract keywords from text
   *
   * - Lowercase
   * - Remove punctuation
   * - Split on whitespace
   * - Filter words >3 chars
   * - Unique only
   * - Max 5 keywords
   *
   * @param text - Text to extract from
   * @returns Array of keywords
   */
  private extractKeywords(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .filter((word) => !['this', 'that', 'with', 'from', 'have', 'been'].includes(word));

    const unique = Array.from(new Set(words));
    return unique.slice(0, 5);
  }

  /**
   * Estimate token count for a context
   *
   * Rough estimate: 4 characters per token
   *
   * @param context - Partial or full context
   * @returns Estimated token count
   */
  private estimateTokens(context: Partial<MemoryContext>): number {
    let totalChars = 0;

    for (const bug of context.relatedBugs || []) {
      totalChars += bug.title.length + (bug.description?.length || 0);
    }

    for (const feature of context.relatedFeatures || []) {
      totalChars += feature.title.length + (feature.description?.length || 0);
    }

    for (const { decision } of context.pastDecisions || []) {
      totalChars += decision.length;
    }

    for (const blocker of context.blockedBy || []) {
      totalChars += blocker.title.length + (blocker.description?.length || 0);
    }

    for (const similar of context.similarIssues || []) {
      totalChars += similar.title.length + (similar.description?.length || 0);
    }

    return Math.ceil(totalChars / 4);
  }

  /**
   * Generate a cache key from query parameters
   *
   * @param projectPath - Project path
   * @param task - Task description
   * @param options - Query options
   * @returns Hash string for cache key
   */
  private hashQuery(projectPath: string, task: string, options: MemoryQueryOptions): string {
    // Use first 100 chars of task for cache key
    const taskSnippet = task.slice(0, 100);
    const optionsStr = JSON.stringify(options);
    return `${projectPath}:${taskSnippet}:${optionsStr}`;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[BeadsMemory] Cache cleared');
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ key: string; age: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, value]) => ({
      key: key.slice(0, 100),
      age: now - value.timestamp,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Cleanup old cache entries
   *
   * Removes entries outside TTL or oldest if at max size
   */
  private cleanupCache(): void {
    const now = Date.now();
    const expired: string[] = [];

    // Remove expired entries
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this.cache.delete(key);
    }

    // If still too many, remove oldest
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const sorted = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );

      const toRemove = sorted.slice(0, this.cache.size - this.MAX_CACHE_SIZE);
      for (const [key] of toRemove) {
        this.cache.delete(key);
      }
    }

    console.log('[BeadsMemory] Cache cleanup: removed', expired.length, 'expired entries');
  }
}
