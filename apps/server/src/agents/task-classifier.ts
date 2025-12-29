/**
 * Task Classifier
 *
 * Analyzes tasks and classifies them to determine which specialized agent
 * should handle them. Uses keyword matching, pattern recognition, and
 * heuristics to route tasks to the most appropriate agent.
 */

import { AgentType, type TaskAnalysis, type TaskClassification } from '@automaker/types';

/**
 * Keywords and patterns associated with each agent type
 */
const AGENT_KEYWORDS: Record<AgentType, string[]> = {
  planning: [
    'plan',
    'specification',
    'design',
    'architecture',
    'break down',
    'task breakdown',
    'roadmap',
    'outline',
    'requirements',
    'acceptance criteria',
    'user story',
    'technical design',
    'create a specification',
    'create a spec',
  ],

  implementation: [
    'implement',
    'create',
    'build',
    'add feature',
    'write code',
    'develop',
    'integrate',
    'functionality',
    'feature',
    'endpoint',
    'api',
    'component',
    'service',
    'module',
  ],

  testing: [
    'test',
    'testing',
    'verify',
    'validate',
    'check',
    'assert',
    'mock',
    'stub',
    'coverage',
    'unit test',
    'integration test',
    'e2e test',
    'playwright',
    'jest',
    'vitest',
  ],

  review: [
    'review',
    'audit',
    'quality',
    'best practices',
    'code review',
    'improve quality',
    'security',
    'security review',
    'security issues',
    'standards',
    'conventions',
  ],

  debug: [
    'bug',
    'error',
    'fix',
    'debug',
    'problem',
    'broken',
    'not working',
    'fail',
    'crash',
    'exception',
    'debugging',
    'troubleshoot',
    'diagnose',
  ],

  documentation: [
    'document',
    'documentation',
    'readme',
    'doc',
    'comment',
    'explain',
    'guide',
    'tutorial',
    'api docs',
    'javadoc',
    'jsdoc',
    'documentation update',
  ],

  refactoring: [
    'refactor',
    'restructure',
    'reorganize',
    'clean up',
    'simplify',
    'improve structure',
    'reduce complexity',
    'extract',
    'consolidate',
    'rearrange',
    'rearchitecture',
    'code smell',
  ],

  generic: ['help', 'assist', 'task', 'work', 'general'],
};

/**
 * File extension patterns associated with each agent type
 */
const AGENT_FILE_PATTERNS: Record<AgentType, RegExp[]> = {
  planning: [/\b(plan|spec|design|architecture)\.(md|txt)/i, /\breadme\b/i],

  implementation: [/\.(ts|js|tsx|jsx|py|java|go|rs|cpp|c|h)$/i],

  testing: [/\.test\.(ts|js|tsx|jsx)$/i, /\.spec\.(ts|js|tsx|jsx)$/i, /__tests__/i, /test/i],

  review: [
    // Review agents work on any code file
    /\.(ts|js|tsx|jsx|py|java|go|rs|cpp|c|h)$/i,
  ],

  debug: [
    // Debug agents work on any code file
    /\.(ts|js|tsx|jsx|py|java|go|rs|cpp|c|h|log)$/i,
  ],

  documentation: [/\.(md|markdown|txt)$/i, /readme/i, /docs?/i, /\.md$/i],

  refactoring: [/\.(ts|js|tsx|jsx|py|java|go|rs|cpp|c|h)$/i],

  generic: [/.*/],
};

/**
 * Language-specific patterns
 */
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  typescript: [/\.ts$/i, /\.tsx$/i],
  javascript: [/\.js$/i, /\.jsx$/i],
  python: [/\.py$/i],
  java: [/\.java$/i],
  go: [/\.go$/i],
  rust: [/\.rs$/i],
  cpp: [/\.cpp$/i, /\.cc$/i, /\.cxx$/i],
  c: [/\.c$/i, /\.h$/i],
};

/**
 * Detect programming language from file paths
 */
function detectLanguage(filePaths: string[]): string | undefined {
  if (!filePaths || filePaths.length === 0) {
    return undefined;
  }

  const languageCounts: Record<string, number> = {};

  for (const filePath of filePaths) {
    for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(filePath)) {
          languageCounts[lang] = (languageCounts[lang] || 0) + 1;
        }
      }
    }
  }

  // Return the most common language
  let maxCount = 0;
  let detectedLang: string | undefined;

  for (const [lang, count] of Object.entries(languageCounts)) {
    if (count > maxCount) {
      maxCount = count;
      detectedLang = lang;
    }
  }

  return detectedLang;
}

/**
 * Calculate complexity from prompt
 */
function calculateComplexity(prompt: string): number {
  let complexity = 5; // Base complexity

  // Factors that increase complexity
  if (prompt.length > 500) complexity += 1;
  if (prompt.length > 1000) complexity += 1;
  if (prompt.includes('multiple') || prompt.includes('several')) complexity += 1;
  if (prompt.includes('integration') || prompt.includes('integrate')) complexity += 1;
  if (prompt.includes('async') || prompt.includes('concurrent')) complexity += 1;

  // Factors that decrease complexity
  if (prompt.length < 100) complexity -= 1;
  if (prompt.includes('simple') || prompt.includes('basic')) complexity -= 1;

  return Math.max(1, Math.min(10, complexity));
}

/**
 * Calculate score for an agent type based on keywords
 */
function calculateAgentScore(prompt: string, agentType: AgentType, keywords: string[]): number {
  const lowerPrompt = prompt.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    // Exact phrase matching gets higher score
    if (lowerPrompt.includes(keyword.toLowerCase())) {
      // Longer phrases get higher scores
      score += keyword.split(' ').length * 2;
    }
  }

  return score;
}

/**
 * Calculate score based on file patterns
 */
function calculateFileScore(filePaths: string[], agentType: AgentType): number {
  if (!filePaths || filePaths.length === 0) {
    return 0;
  }

  const patterns = AGENT_FILE_PATTERNS[agentType];
  let score = 0;

  for (const filePath of filePaths) {
    for (const pattern of patterns) {
      if (pattern.test(filePath)) {
        score += 3;
      }
    }
  }

  return score;
}

/**
 * Sort agent types by priority
 */
function sortByPriority(agentTypes: AgentType[]): AgentType[] {
  const priority: Record<AgentType, number> = {
    [AgentType.PLANNING]: 10,
    [AgentType.IMPLEMENTATION]: 8,
    [AgentType.DEBUG]: 9,
    [AgentType.TESTING]: 7,
    [AgentType.REFACTORING]: 6,
    [AgentType.REVIEW]: 5,
    [AgentType.DOCUMENTATION]: 4,
    [AgentType.GENERIC]: 1,
  };

  return agentTypes.sort((a, b) => priority[b] - priority[a]);
}

/**
 * Task Classifier
 */
export class TaskClassifier {
  /**
   * Analyze a task to extract meaningful information
   */
  analyzeTask(prompt: string, filePaths?: string[]): TaskAnalysis {
    const lowerPrompt = prompt.toLowerCase();

    // Extract keywords that match known patterns
    const keywords: string[] = [];
    for (const agentKeywords of Object.values(AGENT_KEYWORDS)) {
      for (const keyword of agentKeywords) {
        if (lowerPrompt.includes(keyword.toLowerCase()) && !keywords.includes(keyword)) {
          keywords.push(keyword);
        }
      }
    }

    // Detect file patterns
    const filePatterns: string[] = [];
    if (filePaths) {
      for (const filePath of filePaths) {
        for (const [agentType, patterns] of Object.entries(AGENT_FILE_PATTERNS)) {
          for (const pattern of patterns) {
            if (pattern.test(filePath)) {
              filePatterns.push(`${agentType}:${pattern.source}`);
            }
          }
        }
      }
    }

    // Detect language
    const language = detectLanguage(filePaths || []);

    // Calculate complexity
    const complexity = calculateComplexity(prompt);

    // Check for specific task types
    const testKeywords = AGENT_KEYWORDS[AgentType.TESTING];
    const isTestRelated = testKeywords.some((kw) => lowerPrompt.includes(kw.toLowerCase()));

    const docKeywords = AGENT_KEYWORDS[AgentType.DOCUMENTATION];
    const isDocumentationRelated = docKeywords.some((kw) => lowerPrompt.includes(kw.toLowerCase()));

    const debugKeywords = AGENT_KEYWORDS[AgentType.DEBUG];
    const isDebugRelated = debugKeywords.some((kw) => lowerPrompt.includes(kw.toLowerCase()));

    return {
      prompt,
      keywords,
      filePatterns,
      language,
      complexity,
      isTestRelated,
      isDocumentationRelated,
      isDebugRelated,
    };
  }

  /**
   * Classify a task to determine which agent should handle it
   */
  classifyTask(analysis: TaskAnalysis): TaskClassification {
    const scores: Map<AgentType, number> = new Map();

    // Calculate scores for each agent type
    for (const agentType of Object.values(AgentType)) {
      const keywordScore = calculateAgentScore(
        analysis.prompt,
        agentType,
        AGENT_KEYWORDS[agentType]
      );
      const fileScore = calculateFileScore(analysis.filePatterns, agentType);
      scores.set(agentType, keywordScore + fileScore);
    }

    // Sort by score
    const sortedEntries = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);

    // Get top agent
    let topAgentType = sortedEntries[0]?.[0] || AgentType.GENERIC;
    let topScore = sortedEntries[0]?.[1] || 0;

    // Apply priority tiebreaker
    if (topScore === 0 || sortedEntries.filter((e) => e[1] === topScore).length > 1) {
      const tiedAgents = sortedEntries
        .filter((e) => e[1] === topScore)
        .map((e) => e[0] as AgentType);
      topAgentType = sortByPriority(tiedAgents)[0];
    }

    // Calculate confidence based on score gap
    const secondScore = sortedEntries[1]?.[1] || 0;
    const scoreGap = topScore - secondScore;
    const confidence = Math.min(1, (scoreGap + 5) / 15);

    // Generate reason
    const reason = this.generateClassificationReason(topAgentType, analysis);

    // Generate alternatives
    const alternatives = sortedEntries
      .slice(1, 4)
      .filter((entry) => entry[1] > 0)
      .map((entry) => ({
        type: entry[0] as AgentType,
        confidence: Math.min(1, (entry[1] + 5) / 15),
        reason: this.generateClassificationReason(entry[0] as AgentType, analysis),
      }));

    return {
      agentType: topAgentType,
      confidence,
      reason,
      alternatives,
    };
  }

  /**
   * Generate a human-readable reason for classification
   */
  private generateClassificationReason(agentType: AgentType, analysis: TaskAnalysis): string {
    const reasons: string[] = [];

    // Keyword-based reasons
    const keywords = AGENT_KEYWORDS[agentType];
    for (const keyword of keywords) {
      if (analysis.prompt.toLowerCase().includes(keyword.toLowerCase())) {
        reasons.push(`contains "${keyword}"`);
        break;
      }
    }

    // File pattern reasons
    const patterns = AGENT_FILE_PATTERNS[agentType];
    for (const pattern of patterns) {
      for (const filePath of analysis.filePatterns) {
        if (pattern.test(filePath)) {
          reasons.push('works with relevant files');
          break;
        }
      }
      if (reasons.length > 0) break;
    }

    // Language-specific reasons
    if (analysis.language) {
      const langReason = `uses ${analysis.language}`;
      if (!reasons.includes(langReason)) {
        reasons.push(langReason);
      }
    }

    // Default reason
    if (reasons.length === 0) {
      return `matched ${agentType} agent profile`;
    }

    return `Task ${reasons.join(', ')}`;
  }
}

// Singleton instance
export const taskClassifier = new TaskClassifier();
