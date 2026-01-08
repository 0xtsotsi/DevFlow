/**
 * PR Review Service
 *
 * Monitors GitHub PRs for comments, conflicts, and CI failures.
 * Uses Greptile and LSP to analyze and resolve issues.
 *
 * This service handles Phases 5-6 of the orchestrator workflow:
 * - Monitor PRs for comments and conflicts
 * - Parse comments to identify issues
 * - Use research tools to find solutions
 * - Generate fix recommendations
 * - Post analysis back to Vibe-Kanban tasks
 */

import type { EventEmitter } from '../lib/events.js';
import type { PRCommentAnalysis, GreptileSearchResult } from '@devflow/types';
import { getGreptileClient } from './greptile-client.js';
import { execGh } from '@devflow/git-utils';

/**
 * PR comment as returned by GitHub
 */
export interface PRComment {
  id: string;
  databaseId: number;
  author: string;
  authorAssociation: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  isMinimized: boolean;
}

/**
 * PR status check
 */
export interface PRStatusCheck {
  name: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILURE' | 'ERROR';
  conclusion?: string;
  url?: string;
}

/**
 * PR review state
 */
export interface PRReviewState {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  mergeable: boolean | null;
  mergeableState: 'BEHIND' | 'CLEAN' | 'DIRTY' | 'DRAFT' | 'HAS_HOOKS' | 'UNKNOWN';
  headRefOid: string;
  baseRefOid: string;
  headRefName: string;
  baseRefName: string;
  comments: PRComment[];
  reviewComments: PRComment[];
  reviews: PRReview[];
  statusChecks: PRStatusCheck[];
}

/**
 * PR review
 */
export interface PRReview {
  id: string;
  author: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  body: string;
  submittedAt: string;
}

/**
 * PR Review Service Error
 */
export class PRReviewServiceError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'PRReviewServiceError';
  }
}

/**
 * PR Review Service Options
 */
export interface PRReviewServiceOptions {
  /** GitHub repository (owner/repo) */
  githubRepository: string;
  /** Default base branch */
  defaultBaseBranch?: string;
  /** Enable Greptile MCP integration (default: true) */
  enableGreptile?: boolean;
}

/**
 * Comment analysis result with fixes
 */
export interface CommentAnalysisWithFix extends PRCommentAnalysis {
  /** Suggested fix code */
  fixCode?: string;
  /** Files to modify */
  filesToModify: string[];
  /** Priority ranking */
  rank: number;
}

/**
 * PR Review Service
 *
 * Analyzes PR comments and generates actionable fix recommendations.
 */
export class PRReviewService {
  private events: EventEmitter;
  private githubRepository: string;
  private defaultBaseBranch: string;
  private enableGreptile: boolean;
  private prCache: Map<number, PRReviewState> = new Map();
  private greptileClient?: ReturnType<typeof getGreptileClient>;

  constructor(options: PRReviewServiceOptions & { events: EventEmitter }) {
    this.events = options.events;
    this.githubRepository = options.githubRepository;
    this.defaultBaseBranch = options.defaultBaseBranch || 'main';
    this.enableGreptile = options.enableGreptile ?? true;

    // Initialize Greptile client if enabled
    if (this.enableGreptile) {
      try {
        this.greptileClient = getGreptileClient({
          repository: this.githubRepository,
          branch: this.defaultBaseBranch,
          events: this.events,
        });
      } catch (error) {
        console.warn('[PRReviewService] Failed to initialize Greptile client:', error);
        this.greptileClient = undefined;
      }
    }
  }

  /**
   * Get PR state
   */
  async getPRState(prNumber: number): Promise<PRReviewState> {
    try {
      // Use gh CLI to get PR details
      const { stdout: prData } = await execGh(
        `gh pr view ${prNumber} --json title,state,mergeable,mergeableStatus,headRefOid,baseRefOid,headRefName,baseRefName --repo ${this.githubRepository}`,
        { cwd: this.projectPath }
      );

      const pr = JSON.parse(prData);

      // Get comments
      const { stdout: commentsData } = await execGh(
        `gh pr view ${prNumber} --json comments --repo ${this.githubRepository} -q '.comments'`,
        { cwd: this.projectPath }
      );
      const comments: PRComment[] = JSON.parse(commentsData || '[]');

      // Get review comments
      const { stdout: reviewCommentsData } = await execGh(
        `gh pr view ${prNumber} --json comments --repo ${this.githubRepository} -q '.comments[] | select(.reviewId != null)'`,
        { cwd: this.projectPath }
      );
      const reviewComments: PRComment[] = JSON.parse(reviewCommentsData || '[]');

      // Get reviews
      const { stdout: reviewsData } = await execGh(
        `gh pr reviews ${prNumber} --json author,state,body,submittedAt --repo ${this.githubRepository}`,
        { cwd: this.projectPath }
      );
      const reviews: PRReview[] = JSON.parse(reviewsData || '[]');

      // Get status checks
      const statusChecks = await this.getPRStatusChecks(prNumber);

      const state: PRReviewState = {
        number: prNumber,
        title: pr.title || '',
        state: pr.state || 'OPEN',
        mergeable: pr.mergeable ?? null,
        mergeableState: pr.mergeableStatus || 'UNKNOWN',
        headRefOid: pr.headRefOid || '',
        baseRefOid: pr.baseRefOid || '',
        headRefName: pr.headRefName || '',
        baseRefName: pr.baseRefName || '',
        comments,
        reviewComments,
        reviews,
        statusChecks,
      };

      // Cache the state
      this.prCache.set(prNumber, state);

      return state;
    } catch (error) {
      throw new PRReviewServiceError(
        `Failed to get PR ${prNumber} state: ${(error as Error).message}`,
        'PR_FETCH_FAILED',
        error
      );
    }
  }

  /**
   * Get PR status checks
   */
  private async getPRStatusChecks(prNumber: number): Promise<PRStatusCheck[]> {
    try {
      const { stdout } = await execGh(`gh pr checks ${prNumber} --repo ${this.githubRepository}`, {
        cwd: this.projectPath,
      });

      // Parse the output (format varies by gh version)
      const checks: PRStatusCheck[] = [];
      const lines = stdout.split('\n');

      for (const line of lines) {
        if (line.includes('pass') || line.includes('fail') || line.includes('pending')) {
          checks.push({
            name: line.split(' ')[0] || 'unknown',
            status: line.includes('pass')
              ? 'SUCCESS'
              : line.includes('fail')
                ? 'FAILURE'
                : 'PENDING',
          });
        }
      }

      return checks;
    } catch {
      return [];
    }
  }

  /**
   * Analyze PR comments to identify issues
   */
  async analyzePRComments(prNumber: number): Promise<CommentAnalysisWithFix[]> {
    try {
      const prState = await this.getPRState(prNumber);
      const analyses: CommentAnalysisWithFix[] = [];

      // Analyze regular comments
      for (const comment of prState.comments) {
        if (comment.isMinimized) continue; // Skip minimized comments

        const analysis = this.analyzeComment(comment, prState);
        if (analysis) {
          analyses.push(analysis);
        }
      }

      // Analyze review comments
      for (const comment of prState.reviewComments) {
        if (comment.isMinimized) continue;

        const analysis = this.analyzeComment(comment, prState);
        if (analysis) {
          analyses.push(analysis);
        }
      }

      // Sort by priority
      analyses.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      // Add rank
      analyses.forEach((a, i) => (a.rank = i + 1));

      // Emit event
      this.events.emit('orchestrator:pr-comment-analysis', {
        taskId: `pr-${prNumber}`,
        prNumber,
        analyses,
        timestamp: new Date().toISOString(),
      });

      return analyses;
    } catch (error) {
      throw new PRReviewServiceError(
        `Failed to analyze PR ${prNumber} comments: ${(error as Error).message}`,
        'ANALYSIS_FAILED',
        error
      );
    }
  }

  /**
   * Analyze a single comment
   */
  private analyzeComment(
    comment: PRComment,
    _prState: PRReviewState
  ): CommentAnalysisWithFix | null {
    const body = comment.body.toLowerCase();

    // Skip bot comments and trivial comments
    if (comment.author.includes('bot') || comment.author.includes('dependabot')) {
      return null;
    }

    // Determine issue type
    let issueType: PRCommentAnalysis['issueType'] = 'other';
    let priority: PRCommentAnalysis['priority'] = 'low';

    // Check for conflicts
    if (body.includes('conflict') || body.includes('merge conflict')) {
      issueType = 'conflict';
      priority = 'critical';
    }

    // Check for CI failures
    if (
      body.includes('ci failed') ||
      body.includes('build failed') ||
      body.includes('test failed')
    ) {
      issueType = 'ci_failure';
      priority = 'high';
    }

    // Check for suggestions
    if (body.includes('suggest') || body.includes('consider') || body.includes('could you')) {
      issueType = 'suggestion';
      priority = 'medium';
    }

    // Check for questions
    if (body.includes('?') && body.split('?').length < 3) {
      issueType = 'question';
      priority = 'low';
    }

    // Extract affected files from comment
    const affectedFiles = this.extractFilesFromComment(comment.body);

    // Determine recommended action
    let recommendedAction: PRCommentAnalysis['recommendedAction'] = 'ignore';
    if (issueType === 'conflict' || issueType === 'ci_failure') {
      recommendedAction = 'fix';
    } else if (issueType === 'suggestion') {
      recommendedAction = 'fix';
    } else if (issueType === 'question') {
      recommendedAction = 'respond';
    }

    return {
      id: comment.id,
      author: comment.author,
      body: comment.body,
      issueType,
      affectedFiles,
      recommendedAction,
      priority,
      filesToModify: affectedFiles,
      rank: 0,
    };
  }

  /**
   * Extract file references from comment
   */
  private extractFilesFromComment(body: string): string[] {
    const files: string[] = [];

    // Match file paths like `src/file.ts` or "src/file.ts"
    const fileRegex = /[`"]([a-zA-Z0-9_./]+\.ts|tsx|js|jsx|json)[`"]/g;
    let match;

    while ((match = fileRegex.exec(body)) !== null) {
      files.push(match[1]);
    }

    // Also look for patterns like "in X" where X might be a file
    const inRegex = /in\s+([a-zA-Z0-9_./]+\.[a-z]+)/gi;
    while ((match = inRegex.exec(body)) !== null) {
      files.push(match[1]);
    }

    return [...new Set(files)]; // Deduplicate
  }

  /**
   * Check PR for merge conflicts
   */
  async checkForConflicts(prNumber: number): Promise<boolean> {
    try {
      const prState = await this.getPRState(prNumber);

      // Check mergeable state
      if (prState.mergeable === false) {
        return true;
      }

      if (prState.mergeableState === 'DIRTY' || prState.mergeableState === 'BEHIND') {
        return true;
      }

      return false;
    } catch (error) {
      console.warn(`[PRReviewService] Failed to check conflicts for PR ${prNumber}:`, error);
      return false;
    }
  }

  /**
   * Check CI status for PR
   */
  async checkCIStatus(prNumber: number): Promise<'pending' | 'success' | 'failure'> {
    try {
      const prState = await this.getPRState(prNumber);

      // Check if any checks have failed
      if (prState.statusChecks.some((c) => c.status === 'FAILURE')) {
        return 'failure';
      }

      // Check if all checks have passed
      if (
        prState.statusChecks.length > 0 &&
        prState.statusChecks.every((c) => c.status === 'SUCCESS')
      ) {
        return 'success';
      }

      return 'pending';
    } catch (error) {
      console.warn(`[PRReviewService] Failed to check CI status for PR ${prNumber}:`, error);
      return 'pending';
    }
  }

  /**
   * Generate fix suggestions using Greptile/Exa
   * Note: This is a placeholder - actual implementation would use MCP tools
   */
  async generateFixSuggestions(
    prNumber: number,
    analyses: CommentAnalysisWithFix[]
  ): Promise<Map<string, string[]>> {
    const suggestions = new Map<string, string[]>();

    for (const analysis of analyses) {
      if (analysis.issueType === 'conflict') {
        const suggestion = await this.searchConflictResolution(
          analysis.affectedFiles[0] || '',
          prNumber
        );
        if (suggestion) {
          suggestions.set(analysis.id, [suggestion]);
        }
      } else if (analysis.issueType === 'suggestion') {
        // For suggestions, we might search for similar patterns
        const similarPatterns = await this.searchSimilarPatterns(analysis.affectedFiles[0] || '');
        if (similarPatterns.length > 0) {
          suggestions.set(analysis.id, similarPatterns);
        }
      }
    }

    return suggestions;
  }

  /**
   * Search for conflict resolution strategies using Greptile MCP
   *
   * Searches past PRs and code comments for similar conflict resolution patterns.
   * Provides actual resolutions from the codebase history when available.
   *
   * @param file - File path with conflicts
   * @param prNumber - Current PR number for context
   * @returns Conflict resolution suggestion or null
   */
  private async searchConflictResolution(file: string, _prNumber: number): Promise<string | null> {
    try {
      // Get Greptile client
      const greptile = getGreptileClient({
        repository: this.githubRepository,
        branch: this.defaultBaseBranch,
        events: this.events,
      });

      // Search for past conflict resolution comments and strategies
      const comments = await greptile.searchComments(`merge conflict resolution ${file}`, {
        limit: 5,
        addressed: true, // Focus on resolved conflicts
      });

      // If no results, return generic suggestion
      if (!comments || comments.length === 0) {
        console.warn(`[PRReviewService] No conflict resolution history found for ${file}`);
        return this.getGenericConflictResolution(file);
      }

      // Extract actionable resolution strategies from comments
      const resolutions = comments
        .filter((comment) => {
          const body = comment.body.toLowerCase();
          return (
            body.includes('resolve') ||
            body.includes('fixed') ||
            body.includes('resolved by') ||
            body.includes('used') ||
            body.includes('applied')
          );
        })
        .map((comment) => {
          const body = comment.body;

          // Extract git commands if present
          if (body.includes('git checkout')) {
            const match = body.match(/git checkout (--[a-z]+)+\s+\S+/g);
            if (match) {
              return `Try: ${match.join(' or ')}`;
            }
          }

          // Extract resolution descriptions
          if (body.includes('resolved by')) {
            const match = body.match(/resolved by (.+?)(?:\.|\n|$)/i);
            return match ? `Resolution: ${match[1].trim()}` : null;
          }

          if (body.includes('fixed by')) {
            const match = body.match(/fixed by (.+?)(?:\.|\n|$)/i);
            return match ? `Fix: ${match[1].trim()}` : null;
          }

          // Return truncated body as fallback
          return body.length > 150 ? `${body.substring(0, 150)}...` : body;
        })
        .filter(Boolean) as string[];

      if (resolutions.length > 0) {
        const resolution = `Past conflict resolutions for this file:\n${resolutions.join('\n')}`;
        console.log(
          `[PRReviewService] Found ${resolutions.length} conflict resolution patterns for ${file}`
        );
        return resolution;
      }

      return this.getGenericConflictResolution(file);
    } catch (error) {
      // Log error but don't fail - return generic suggestion
      console.warn(`[PRReviewService] Failed to search conflict resolutions for ${file}:`, error);
      return this.getGenericConflictResolution(file);
    }
  }

  /**
   * Get generic conflict resolution suggestions
   *
   * Provides fallback guidance when Greptile search is unavailable or returns no results.
   *
   * @param file - File path with conflicts
   * @returns Generic resolution suggestion
   */
  private getGenericConflictResolution(file: string): string {
    return `Consider using "git checkout --theirs ${file}" or "git checkout --ours ${file}" to resolve conflicts manually. Alternatively, use "git mergetool" for an interactive resolution.`;
  }

  /**
   * Search for similar code patterns using Greptile MCP
   *
   * Uses semantic code search to find similar implementation patterns
   * in the codebase that can be used as reference for resolving suggestions.
   *
   * @param file - File path to search for similar patterns
   * @returns Array of formatted code examples with context
   */
  private async searchSimilarPatterns(file: string): Promise<string[]> {
    try {
      // Get Greptile client
      const greptile = getGreptileClient({
        repository: this.githubRepository,
        branch: this.defaultBaseBranch,
        events: this.events,
      });

      // Build semantic search query based on file path
      const searchQuery = `similar implementation patterns in ${file}`;

      // Search for similar code patterns
      const results = await greptile.semanticSearch(searchQuery, {
        filePath: file,
        limit: 5,
      });

      // If no results found, return empty array
      if (!results || results.length === 0) {
        console.warn(`[PRReviewService] No similar patterns found for ${file}`);
        return [];
      }

      // Format results as readable strings with context
      const formattedPatterns: string[] = results.map((result: GreptileSearchResult) => {
        const pattern: string[] = [
          `File: ${result.filePath}:${result.lineNumber}`,
          result.symbolName ? `Symbol: ${result.symbolName}` : '',
          `Relevance: ${(result.relevanceScore * 100).toFixed(1)}%`,
          '',
          '```typescript',
          result.code.trim(),
          '```',
        ];
        return pattern.filter(Boolean).join('\n');
      });

      console.log(
        `[PRReviewService] Found ${formattedPatterns.length} similar patterns for ${file}`
      );

      return formattedPatterns;
    } catch (error) {
      // Log error but don't fail - return empty array
      console.warn(`[PRReviewService] Failed to search similar patterns for ${file}:`, error);
      return [];
    }
  }

  /**
   * Format analysis as markdown for posting to Vibe-Kanban
   */
  formatAnalysisAsMarkdown(prNumber: string, analyses: CommentAnalysisWithFix[]): string {
    const lines = [
      `# PR #${prNumber} Review Analysis`,
      '',
      `## Summary`,
      `Found ${analyses.length} items requiring attention.`,
      '',
      `## Issues`,
    ];

    for (const analysis of analyses) {
      lines.push(`### ${analysis.priority.toUpperCase()}: ${analysis.issueType}`);
      lines.push('');
      lines.push(`**Author:** ${analysis.author}`);
      lines.push(`**Comment:** ${analysis.body.substring(0, 200)}...`);
      if (analysis.affectedFiles.length > 0) {
        lines.push(`**Files:** ${analysis.affectedFiles.join(', ')}`);
      }
      lines.push(`**Action:** ${analysis.recommendedAction}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Clear cached PR data
   */
  clearCache(prNumber?: number): void {
    if (prNumber) {
      this.prCache.delete(prNumber);
    } else {
      this.prCache.clear();
    }
  }

  /**
   * Get service statistics
   */
  getStats(): {
    cachedPRs: number;
  } {
    return {
      cachedPRs: this.prCache.size,
    };
  }
}

/**
 * Create a PR review service
 */
export function createPRReviewService(
  options: PRReviewServiceOptions & { events: EventEmitter }
): PRReviewService {
  return new PRReviewService(options);
}
