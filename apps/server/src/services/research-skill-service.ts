/**
 * Research Skill Service
 *
 * Orchestrates parallel research agents to gather comprehensive context:
 * - Codebase research (via Grep MCP)
 * - Web research (via Exa MCP)
 * - Beads memory query
 *
 * Emits events for orchestration and provides AI-generated summaries.
 */

import type { EventEmitter } from '../lib/events.js';
import { getMCPBridge } from '../lib/mcp-bridge.js';

/**
 * Result from a single research agent
 */
interface ResearchAgentResult {
  /** Agent type */
  agentType: 'codebase' | 'web' | 'beads';
  /** Whether this agent succeeded */
  success: boolean;
  /** Data returned by the agent */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Time taken in milliseconds */
  duration: number;
}

/**
 * Comprehensive research result
 */
export interface ResearchResult {
  /** Overall success */
  success: boolean;
  /** Results from each agent */
  agents: {
    codebase: ResearchAgentResult;
    web: ResearchAgentResult;
    beads: ResearchAgentResult;
  };
  /** AI-generated summary of findings */
  summary?: {
    keyFindings: string[];
    recommendations: string[];
    relatedContext: string[];
    estimatedTokens: number;
  };
  /** Total time taken */
  totalDuration: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Options for research skill execution
 */
export interface ResearchSkillOptions {
  /** Project path for context */
  projectPath: string;
  /** Research query/topic */
  query: string;
  /** Maximum results per agent (default: 10) */
  maxResults?: number;
  /** Whether to include closed issues (default: true) */
  includeClosedIssues?: boolean;
  /** Whether to enable web search (default: true) */
  enableWebSearch?: boolean;
}

/**
 * Codebase research result
 */
interface CodebaseResearchResult {
  /** Code patterns found */
  patterns: Array<{
    file: string;
    line: number;
    code: string;
    context: string;
  }>;
  /** Related files */
  relatedFiles: string[];
  /** Total matches */
  totalMatches: number;
}

/**
 * Web research result
 */
interface WebResearchResult {
  /** Search results */
  results: Array<{
    title: string;
    url: string;
    summary: string;
    relevanceScore: number;
  }>;
  /** Key insights */
  insights: string[];
  /** Total results */
  totalResults: number;
}

/**
 * Beads memory result
 */
interface BeadsMemoryResult {
  /** Related issues */
  issues: Array<{
    id: string;
    title: string;
    status: string;
    type: string;
    priority: string;
    summary: string;
  }>;
  /** Past decisions */
  decisions: Array<{
    issueId: string;
    decision: string;
    rationale: string;
  }>;
  /** Total issues found */
  totalIssues: number;
}

export class ResearchSkillService {
  private events: EventEmitter;
  private mcpBridge: ReturnType<typeof getMCPBridge>;

  constructor(events: EventEmitter) {
    this.events = events;
    this.mcpBridge = getMCPBridge(events);
  }

  /**
   * Execute comprehensive research with parallel agents
   */
  async execute(options: ResearchSkillOptions): Promise<ResearchResult> {
    const startTime = Date.now();
    const {
      projectPath,
      query,
      maxResults = 10,
      includeClosedIssues = true,
      enableWebSearch = true,
    } = options;

    this.events.emit('skill:started', {
      skill: 'research',
      query,
      timestamp: new Date().toISOString(),
    });

    try {
      // Spawn all research agents in parallel
      const agentPromises = [
        this.runCodebaseResearch(projectPath, query, maxResults),
        this.runWebResearch(query, maxResults, enableWebSearch),
        this.runBeadsMemoryResearch(projectPath, query, maxResults, includeClosedIssues),
      ];

      // Wait for all agents to complete
      const results = await Promise.all(agentPromises);

      const [codebaseResult, webResult, beadsResult] = results;

      // Generate AI summary
      const summary = await this.generateResearchSummary(
        query,
        codebaseResult,
        webResult,
        beadsResult
      );

      const totalDuration = Date.now() - startTime;

      const researchResult: ResearchResult = {
        success: codebaseResult.success || webResult.success || beadsResult.success,
        agents: {
          codebase: codebaseResult,
          web: webResult,
          beads: beadsResult,
        },
        summary,
        totalDuration,
        timestamp: new Date().toISOString(),
      };

      this.events.emit('skill:completed', {
        skill: 'research',
        query,
        duration: totalDuration,
        success: researchResult.success,
        timestamp: new Date().toISOString(),
      });

      return researchResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:failed', {
        skill: 'research',
        query,
        error: errorMessage,
        duration,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Run codebase research agent (Grep MCP)
   */
  private async runCodebaseResearch(
    projectPath: string,
    query: string,
    _maxResults: number
  ): Promise<ResearchAgentResult> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:agent-started', {
        skill: 'research',
        agent: 'codebase',
        query,
      });

      // Use Grep MCP to search for code patterns
      // Build search query from natural language
      const searchTerms = this.extractSearchTerms(query);

      const result = await this.mcpBridge.callTool(
        'mcp__grep__searchGitHub',
        {
          query: searchTerms[0] || query,
          matchCase: false,
          useRegexp: false,
          language: ['TypeScript', 'JavaScript'],
        },
        { timeout: 30000, throwOnError: false }
      );

      const duration = Date.now() - startTime;

      if (result.success && result.data) {
        const codebaseData = result.data as CodebaseResearchResult;

        this.events.emit('skill:agent-completed', {
          skill: 'research',
          agent: 'codebase',
          duration,
          resultsCount: codebaseData.totalMatches || 0,
        });

        return {
          agentType: 'codebase',
          success: true,
          data: codebaseData,
          duration,
        };
      } else {
        throw new Error(result.error || 'Codebase research failed');
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:agent-failed', {
        skill: 'research',
        agent: 'codebase',
        error: errorMessage,
        duration,
      });

      return {
        agentType: 'codebase',
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Run web research agent (Exa MCP)
   */
  private async runWebResearch(
    query: string,
    maxResults: number,
    enabled: boolean
  ): Promise<ResearchAgentResult> {
    const startTime = Date.now();

    if (!enabled) {
      return {
        agentType: 'web',
        success: true,
        data: { results: [], insights: [], totalResults: 0 },
        duration: 0,
      };
    }

    try {
      this.events.emit('skill:agent-started', {
        skill: 'research',
        agent: 'web',
        query,
      });

      // Use Exa MCP for web research
      const result = await this.mcpBridge.callTool(
        'mcp__exa__get_code_context_exa',
        {
          query,
          tokensNum: 5000,
        },
        { timeout: 30000, throwOnError: false }
      );

      const duration = Date.now() - startTime;

      if (result.success && result.data) {
        this.events.emit('skill:agent-completed', {
          skill: 'research',
          agent: 'web',
          duration,
          resultsCount: 1, // Exa returns aggregated context
        });

        return {
          agentType: 'web',
          success: true,
          data: result.data,
          duration,
        };
      } else {
        throw new Error(result.error || 'Web research failed');
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:agent-failed', {
        skill: 'research',
        agent: 'web',
        error: errorMessage,
        duration,
      });

      return {
        agentType: 'web',
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Run Beads memory research agent
   */
  private async runBeadsMemoryResearch(
    projectPath: string,
    query: string,
    maxResults: number,
    includeClosed: boolean
  ): Promise<ResearchAgentResult> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:agent-started', {
        skill: 'research',
        agent: 'beads',
        query,
      });

      // Query Beads memory service
      // This would integrate with BeadsMemoryService
      const result = await this.mcpBridge.callTool(
        'query_beads_memory', // Tool provided by Beads integration
        {
          query,
          maxResults,
          includeClosed,
        },
        { timeout: 20000, throwOnError: false }
      );

      const duration = Date.now() - startTime;

      if (result.success && result.data) {
        const beadsData = result.data as BeadsMemoryResult;

        this.events.emit('skill:agent-completed', {
          skill: 'research',
          agent: 'beads',
          duration,
          resultsCount: beadsData.totalIssues || 0,
        });

        return {
          agentType: 'beads',
          success: true,
          data: beadsData,
          duration,
        };
      } else {
        throw new Error(result.error || 'Beads memory query failed');
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:agent-failed', {
        skill: 'research',
        agent: 'beads',
        error: errorMessage,
        duration,
      });

      return {
        agentType: 'beads',
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Generate AI summary of research findings
   */
  private async generateResearchSummary(
    query: string,
    codebaseResult: ResearchAgentResult,
    webResult: ResearchAgentResult,
    beadsResult: ResearchAgentResult
  ): Promise<ResearchResult['summary']> {
    // Aggregate findings
    const keyFindings: string[] = [];
    const recommendations: string[] = [];
    const relatedContext: string[] = [];

    // Process codebase findings
    if (codebaseResult.success && codebaseResult.data) {
      const codebaseData = codebaseResult.data as CodebaseResearchResult;
      keyFindings.push(`Found ${codebaseData.totalMatches} code patterns in codebase`);
      if (codebaseData.relatedFiles.length > 0) {
        relatedContext.push(`Related files: ${codebaseData.relatedFiles.slice(0, 5).join(', ')}`);
      }
    }

    // Process web findings
    if (webResult.success && webResult.data) {
      const webData = webResult.data as WebResearchResult;
      keyFindings.push(`Found ${webData.totalResults} relevant web resources`);
      if (webData.insights.length > 0) {
        recommendations.push(...webData.insights.slice(0, 3));
      }
    }

    // Process Beads findings
    if (beadsResult.success && beadsResult.data) {
      const beadsData = beadsResult.data as BeadsMemoryResult;
      keyFindings.push(`Found ${beadsData.totalIssues} related issues in memory`);
      if (beadsData.decisions.length > 0) {
        relatedContext.push(
          `Past decisions: ${beadsData.decisions.map((d) => d.decision).join('; ')}`
        );
      }
    }

    // Estimate tokens
    const estimatedTokens = this.estimateTokens(
      JSON.stringify({ keyFindings, recommendations, relatedContext })
    );

    return {
      keyFindings,
      recommendations,
      relatedContext,
      estimatedTokens,
    };
  }

  /**
   * Extract search terms from natural language query
   */
  private extractSearchTerms(query: string): string[] {
    // Simple extraction: look for code-like patterns
    const terms: string[] = [];

    // Extract quoted strings
    const quotedMatches = query.match(/"([^"]+)"/g);
    if (quotedMatches) {
      terms.push(...quotedMatches.map((m) => m.slice(1, -1)));
    }

    // Extract function/class patterns
    const functionPattern = /\b(\w+)\s*\(/g;
    let match;
    while ((match = functionPattern.exec(query)) !== null) {
      terms.push(match[1] + '(');
    }

    return terms.length > 0 ? terms : [query];
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if the research skill is available
   */
  isAvailable(): boolean {
    // Research skill is available if MCP bridge is available
    const mcpBridge = getMCPBridge(this.events);
    return mcpBridge.isAvailable();
  }
}
