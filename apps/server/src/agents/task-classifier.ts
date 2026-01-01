/**
 * Task Classifier
 *
 * Analyzes tasks and classifies them to determine which specialized agent
 * should handle them. Uses keyword matching, pattern recognition, and
 * heuristics to route tasks to the most appropriate agent.
 */

import type { AgentType, TaskAnalysis, TaskClassification } from '@automaker/types';

/**
 * Keywords and patterns associated with each agent type
 */
const AGENT_KEYWORDS: Record<string, string[]> = {
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
 * Exported for potential future file-based classification enhancements
 */
export const AGENT_FILE_PATTERNS: Record<string, RegExp[]> = {
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

  refactoring: [
    // Refactoring agents work on any code file
    /\.(ts|js|tsx|jsx|py|java|go|rs|cpp|c|h)$/i,
  ],

  generic: [
    /.*/, // Matches anything
  ],
};

/**
 * Task classifier implementation
 */
export class TaskClassifier {
  /**
   * Analyze a task prompt to extract key information
   */
  analyzeTask(prompt: string, filePaths?: string[]): TaskAnalysis {
    // Extract keywords
    const keywords = this.extractKeywords(prompt);

    // Detect programming languages
    const languages = this.detectLanguages(prompt, filePaths);

    // Detect file types
    const fileTypes = this.detectFileTypes(filePaths);

    // Detect frameworks/technologies
    const frameworks = this.detectFrameworks(prompt);

    // Determine complexity
    const complexity = this.assessComplexity(prompt);

    // Determine task characteristics
    const involvesCode = this.involvesCodeCreation(prompt, filePaths);
    const involvesTesting = this.involvesTestingWork(prompt);
    const involvesDocs = this.involvesDocumentationWork(prompt);
    const involvesDebugging = this.involvesDebuggingWork(prompt);

    return {
      prompt,
      keywords,
      languages,
      fileTypes,
      frameworks,
      complexity,
      involvesCode,
      involvesTesting,
      involvesDocs,
      involvesDebugging,
    };
  }

  /**
   * Classify a task to determine which agent should handle it
   */
  classifyTask(analysis: TaskAnalysis): TaskClassification {
    // Handle edge case: empty or minimal prompts
    const cleanedPrompt = analysis.prompt.replace(/[^\w\s]/g, '').trim();
    if (!analysis.prompt || analysis.prompt.trim().length === 0 || cleanedPrompt.length === 0) {
      return {
        agentType: 'generic',
        confidence: 0.3,
        reason: 'Empty or minimal prompt, using generic agent',
        alternatives: [],
      };
    }

    const scores = this.calculateAgentScores(analysis);

    // Sort by score
    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
      // Fallback to generic agent
      return {
        agentType: 'generic',
        confidence: 0.3,
        reason: 'No clear agent match, using generic agent',
        alternatives: [],
      };
    }

    const [topAgentType, topScore] = sorted[0];

    // Build alternatives (next 2 highest scores)
    const alternatives = sorted.slice(1, 3).map(([agentType, score]) => ({
      type: agentType,
      confidence: score,
      reason: this.getAlternativeReason(agentType, analysis),
    }));

    return {
      agentType: topAgentType,
      confidence: topScore,
      reason: this.getClassificationReason(topAgentType, analysis, topScore),
      alternatives,
    };
  }

  /**
   * Extract keywords from a prompt
   */
  private extractKeywords(prompt: string): string[] {
    const words = prompt
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3);

    // Remove common stop words
    const stopWords = new Set([
      'that',
      'this',
      'with',
      'from',
      'have',
      'will',
      'should',
      'would',
      'could',
      'their',
      'there',
      'about',
      'after',
    ]);

    return words.filter((word) => !stopWords.has(word));
  }

  /**
   * Detect programming languages mentioned in the prompt
   */
  private detectLanguages(prompt: string, filePaths?: string[]): string[] {
    const languages: string[] = [];
    const lowerPrompt = prompt.toLowerCase();

    const languagePatterns: Record<string, RegExp[]> = {
      TypeScript: [/\b(typescript|ts)\b/i],
      JavaScript: [/\b(javascript|js|node)\b/i],
      Python: [/\bpython\b/i],
      Java: [/\bjava\b/i],
      Go: [/\bgo\b/i],
      Rust: [/\brust\b/i],
      C: [/\bc\s*\+\+\b/i, /\bc\b/i],
      Ruby: [/\bruby\b/i],
      PHP: [/\bphp\b/i],
    };

    for (const [lang, patterns] of Object.entries(languagePatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(lowerPrompt)) {
          languages.push(lang);
          break;
        }
      }
    }

    // Detect from file paths
    if (filePaths) {
      const extMap: Record<string, string> = {
        '.ts': 'TypeScript',
        '.tsx': 'TypeScript',
        '.js': 'JavaScript',
        '.jsx': 'JavaScript',
        '.py': 'Python',
        '.java': 'Java',
        '.go': 'Go',
        '.rs': 'Rust',
        '.cpp': 'C++',
        '.c': 'C',
        '.rb': 'Ruby',
        '.php': 'PHP',
      };

      for (const filePath of filePaths) {
        const ext = filePath.substring(filePath.lastIndexOf('.'));
        if (ext && extMap[ext] && !languages.includes(extMap[ext])) {
          languages.push(extMap[ext]);
        }
      }
    }

    return languages;
  }

  /**
   * Detect file types from file paths
   */
  private detectFileTypes(filePaths?: string[]): string[] {
    if (!filePaths || filePaths.length === 0) {
      return [];
    }

    const types = new Set<string>();

    for (const filePath of filePaths) {
      // Check for test files first (before general code files)
      if (filePath.match(/\.(test|spec)\.(ts|js|tsx|jsx)$/i)) {
        types.add('test');
      } else if (filePath.match(/\.(md|markdown|txt)$/i)) {
        types.add('documentation');
      } else if (filePath.match(/\.(ts|js|tsx|jsx|py|java|go|rs|cpp|c|h)$/i)) {
        types.add('code');
      } else if (filePath.match(/\.(json|yaml|yml|xml)$/i)) {
        types.add('config');
      } else if (filePath.match(/\.(css|scss|less|sass)$/i)) {
        types.add('stylesheet');
      } else if (filePath.match(/\.(html|htm)$/i)) {
        types.add('markup');
      }
    }

    return Array.from(types);
  }

  /**
   * Detect frameworks/technologies
   */
  private detectFrameworks(prompt: string): string[] {
    const frameworks: string[] = [];
    const lowerPrompt = prompt.toLowerCase();

    const frameworkPatterns: Record<string, RegExp> = {
      React: /\breact\b/i,
      Vue: /\bvue\b/i,
      Angular: /\bangular\b/i,
      Next: /\bnext\.?js\b/i,
      Express: /\bexpress\b/i,
      FastAPI: /\bfastapi\b/i,
      Django: /\bdjango\b/i,
      'Node.js': /\bnode\.?js\b/i,
      Nest: /\bnest\.?js\b/i,
      Playwright: /\bplaywright\b/i,
      Jest: /\bjest\b/i,
      Vitest: /\bvitest\b/i,
    };

    for (const [framework, pattern] of Object.entries(frameworkPatterns)) {
      if (pattern.test(lowerPrompt)) {
        frameworks.push(framework);
      }
    }

    return frameworks;
  }

  /**
   * Assess task complexity
   */
  private assessComplexity(prompt: string): 'simple' | 'medium' | 'complex' {
    const words = prompt.split(/\s+/).length;
    const lines = prompt.split('\n').length;

    // Complexity indicators
    const complexityIndicators = {
      simple: [
        'add',
        'create',
        'update',
        'fix',
        'remove',
        'change',
        'simple',
        'quick',
        'small',
        'minor',
      ],
      complex: [
        'architecture',
        'system',
        'multiple',
        'integrate',
        'refactor',
        'comprehensive',
        'complete',
        'overhaul',
        'redesign',
      ],
    };

    const lowerPrompt = prompt.toLowerCase();

    // Check for explicit complexity indicators
    for (const indicator of complexityIndicators.complex) {
      if (lowerPrompt.includes(indicator)) {
        return 'complex';
      }
    }

    for (const indicator of complexityIndicators.simple) {
      if (lowerPrompt.includes(indicator)) {
        return 'simple';
      }
    }

    // Base complexity on length
    if (words < 50 || lines < 5) {
      return 'simple';
    } else if (words < 200 || lines < 20) {
      return 'medium';
    } else {
      return 'complex';
    }
  }

  /**
   * Determine if task involves code creation
   */
  private involvesCodeCreation(prompt: string, filePaths?: string[]): boolean {
    const lowerPrompt = prompt.toLowerCase();
    const codeKeywords = [
      'implement',
      'create',
      'build',
      'add',
      'write',
      'develop',
      'function',
      'class',
      'component',
      'service',
      'module',
    ];

    const hasCodeKeywords = codeKeywords.some((keyword) => lowerPrompt.includes(keyword));
    const hasCodeFiles =
      filePaths?.some((path) => path.match(/\.(ts|js|tsx|jsx|py|java|go|rs|cpp|c|h)$/i)) || false;

    return hasCodeKeywords || hasCodeFiles;
  }

  /**
   * Determine if task involves testing
   */
  private involvesTestingWork(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase();
    const testKeywords = [
      'test',
      'testing',
      'verify',
      'validate',
      'check',
      'assert',
      'mock',
      'coverage',
      'spec',
    ];

    return testKeywords.some((keyword) => lowerPrompt.includes(keyword));
  }

  /**
   * Determine if task involves documentation
   */
  private involvesDocumentationWork(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase();
    const docKeywords = [
      'document',
      'documentation',
      'readme',
      'doc',
      'comment',
      'explain',
      'guide',
      'tutorial',
    ];

    return docKeywords.some((keyword) => lowerPrompt.includes(keyword));
  }

  /**
   * Determine if task involves debugging
   */
  private involvesDebuggingWork(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase();
    const debugKeywords = [
      'bug',
      'error',
      'fix',
      'debug',
      'issue',
      'problem',
      'broken',
      'not working',
      'fail',
      'crash',
      'exception',
    ];

    return debugKeywords.some((keyword) => lowerPrompt.includes(keyword));
  }

  /**
   * Calculate scores for each agent type based on task analysis
   */
  private calculateAgentScores(analysis: TaskAnalysis): Map<AgentType, number> {
    const scores = new Map<AgentType, number>();

    // Initialize scores
    for (const agentType of Object.keys(AGENT_KEYWORDS) as AgentType[]) {
      scores.set(agentType, 0);
    }

    // Keyword matching score - longer phrases get higher weight
    for (const [agentType, keywords] of Object.entries(AGENT_KEYWORDS)) {
      let keywordScore = 0;
      for (const keyword of keywords) {
        if (analysis.prompt.toLowerCase().includes(keyword.toLowerCase())) {
          // Longer phrases (multi-word) get higher scores
          const wordCount = keyword.split(/\s+/).length;
          keywordScore += 0.25 + (wordCount - 1) * 0.2;
        }
      }
      // Cap keyword score at 0.9
      scores.set(agentType as AgentType, Math.min(keywordScore, 0.9));
    }

    // Boost scores based on task characteristics
    if (analysis.involvesDebugging) {
      const debugScore = scores.get('debug') || 0;
      scores.set('debug', Math.min(debugScore + 0.4, 1.0));
    }

    if (analysis.involvesTesting) {
      const testScore = scores.get('testing') || 0;
      scores.set('testing', Math.min(testScore + 0.4, 1.0));
    }

    if (analysis.involvesDocs) {
      const docScore = scores.get('documentation') || 0;
      scores.set('documentation', Math.min(docScore + 0.4, 1.0));
    }

    if (analysis.involvesCode) {
      const implScore = scores.get('implementation') || 0;
      scores.set('implementation', Math.min(implScore + 0.3, 1.0));
    }

    // Complexity adjustments
    if (analysis.complexity === 'complex') {
      const planningScore = scores.get('planning') || 0;
      scores.set('planning', Math.min(planningScore + 0.2, 1.0));
    }

    // File type adjustments
    if (analysis.fileTypes.includes('test')) {
      const testScore = scores.get('testing') || 0;
      scores.set('testing', Math.min(testScore + 0.3, 1.0));
    }

    if (analysis.fileTypes.includes('documentation')) {
      const docScore = scores.get('documentation') || 0;
      scores.set('documentation', Math.min(docScore + 0.3, 1.0));
    }

    return scores;
  }

  /**
   * Get the reason for classifying a task to an agent
   */
  private getClassificationReason(
    agentType: AgentType,
    analysis: TaskAnalysis,
    score: number
  ): string {
    const keywords = AGENT_KEYWORDS[agentType];
    const matchedKeywords = keywords.filter((keyword) =>
      analysis.prompt.toLowerCase().includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      return `Task contains keywords associated with ${agentType}: ${matchedKeywords.slice(0, 3).join(', ')}`;
    }

    if (analysis.involvesDebugging && agentType === 'debug') {
      return 'Task appears to involve debugging or fixing issues';
    }

    if (analysis.involvesTesting && agentType === 'testing') {
      return 'Task appears to involve testing or verification';
    }

    if (analysis.involvesDocs && agentType === 'documentation') {
      return 'Task appears to involve documentation';
    }

    if (analysis.complexity === 'complex' && agentType === 'planning') {
      return 'Complex task that would benefit from planning';
    }

    return `Task classified as ${agentType} based on pattern analysis (confidence: ${(score * 100).toFixed(0)}%)`;
  }

  /**
   * Get the reason for an alternative agent suggestion
   */
  private getAlternativeReason(agentType: AgentType, analysis: TaskAnalysis): string {
    const keywords = AGENT_KEYWORDS[agentType];
    const matchedKeywords = keywords.filter((keyword) =>
      analysis.prompt.toLowerCase().includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      return `Also contains keywords related to ${agentType}`;
    }

    return `Could also be handled by ${agentType} agent`;
  }
}

// Export singleton instance
export const taskClassifier = new TaskClassifier();
