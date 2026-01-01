/**
 * CI/CD Skill Service
 *
 * Orchestrates comprehensive CI/CD validation pipeline:
 * - Linting (ESLint)
 * - Type checking (TypeScript)
 * - Unit tests (Vitest)
 * - Build verification
 * - E2E tests (Playwright)
 * - Security scanning (optional)
 *
 * Generates HTML/PDF reports and supports auto-commit integration.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';

const execAsync = promisify(exec);

/**
 * Result from a single CI/CD stage
 */
interface StageResult {
  /** Stage name */
  stage: 'lint' | 'typecheck' | 'tests' | 'build' | 'e2e' | 'security';
  /** Whether this stage succeeded */
  success: boolean;
  /** Output from the stage */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Time taken in milliseconds */
  duration: number;
  /** Number of issues found */
  issuesFound?: number;
}

/**
 * CI/CD validation result
 */
export interface CICDResult {
  /** Overall success */
  success: boolean;
  /** Results from each stage */
  stages: {
    lint: StageResult;
    typecheck: StageResult;
    tests: StageResult;
    build: StageResult;
    e2e: StageResult;
    security: StageResult;
  };
  /** Total time taken */
  totalDuration: number;
  /** Report path (HTML) */
  reportPath?: string;
  /** Whether to auto-commit */
  autoCommit: boolean;
  /** Commit hash if committed */
  commitHash?: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * Options for CI/CD skill execution
 */
export interface CICDSkillOptions {
  /** Project path */
  projectPath: string;
  /** Which stages to run (default: all) */
  stages?: ('lint' | 'typecheck' | 'tests' | 'build' | 'e2e' | 'security')[];
  /** Whether to generate HTML report (default: true) */
  generateReport?: boolean;
  /** Whether to auto-commit on success (default: false) */
  autoCommit?: boolean;
  /** Commit message if auto-committing */
  commitMessage?: string;
  /** Report output directory (default: .cicd-reports) */
  reportDir?: string;
}

export class CICDSkillService {
  private events: EventEmitter;

  constructor(events: EventEmitter) {
    this.events = events;
  }

  /**
   * Execute CI/CD pipeline
   */
  async execute(options: CICDSkillOptions): Promise<CICDResult> {
    const startTime = Date.now();
    const {
      projectPath,
      stages = ['lint', 'typecheck', 'tests', 'build', 'e2e', 'security'],
      generateReport = true,
      autoCommit = false,
      commitMessage = 'ci: automated commit after successful CI/CD',
      reportDir = '.cicd-reports',
    } = options;

    this.events.emit('skill:started', {
      skill: 'cicd',
      projectPath,
      stages,
      timestamp: new Date().toISOString(),
    });

    try {
      // Run all requested stages
      const stageResults: Partial<CICDResult['stages']> = {};

      // Lint stage
      if (stages.includes('lint')) {
        stageResults.lint = await this.runLintStage(projectPath);
      }

      // Typecheck stage
      if (stages.includes('typecheck')) {
        stageResults.typecheck = await this.runTypecheckStage(projectPath);
      }

      // Tests stage
      if (stages.includes('tests')) {
        stageResults.tests = await this.runTestsStage(projectPath);
      }

      // Build stage
      if (stages.includes('build')) {
        stageResults.build = await this.runBuildStage(projectPath);
      }

      // E2E stage
      if (stages.includes('e2e')) {
        stageResults.e2e = await this.runE2EStage(projectPath);
      }

      // Security stage
      if (stages.includes('security')) {
        stageResults.security = await this.runSecurityStage(projectPath);
      }

      const allStages = stageResults as CICDResult['stages'];
      const overallSuccess = Object.values(allStages).every((s) => s.success);

      // Generate report if requested
      let reportPath: string | undefined;
      if (generateReport) {
        reportPath = await this.generateReport(projectPath, reportDir, allStages);
      }

      // Auto-commit if requested and all stages passed
      let commitHash: string | undefined;
      if (autoCommit && overallSuccess) {
        commitHash = await this.autoCommitChanges(projectPath, commitMessage);
      }

      const totalDuration = Date.now() - startTime;

      const cicdResult: CICDResult = {
        success: overallSuccess,
        stages: allStages,
        totalDuration,
        reportPath,
        autoCommit,
        commitHash,
        timestamp: new Date().toISOString(),
      };

      this.events.emit('skill:completed', {
        skill: 'cicd',
        projectPath,
        duration: totalDuration,
        success: overallSuccess,
        timestamp: new Date().toISOString(),
      });

      return cicdResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:failed', {
        skill: 'cicd',
        projectPath,
        error: errorMessage,
        duration,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Run linting stage
   */
  private async runLintStage(projectPath: string): Promise<StageResult> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:stage-started', {
        skill: 'cicd',
        stage: 'lint',
      });

      const { stdout, stderr } = await execAsync('npm run lint', {
        cwd: projectPath,
        timeout: 120000,
      });

      const duration = Date.now() - startTime;
      const output = stdout + stderr;
      const issuesFound = (output.match(/error/g) || []).length;

      this.events.emit('skill:stage-completed', {
        skill: 'cicd',
        stage: 'lint',
        duration,
        issuesFound,
      });

      return {
        stage: 'lint',
        success: true,
        output,
        duration,
        issuesFound,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:stage-failed', {
        skill: 'cicd',
        stage: 'lint',
        error: errorMessage,
        duration,
      });

      return {
        stage: 'lint',
        success: false,
        error: errorMessage,
        duration,
        issuesFound: (errorMessage.match(/error/g) || []).length,
      };
    }
  }

  /**
   * Run typecheck stage
   */
  private async runTypecheckStage(projectPath: string): Promise<StageResult> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:stage-started', {
        skill: 'cicd',
        stage: 'typecheck',
      });

      const { stdout, stderr } = await execAsync('npx tsc --noEmit', {
        cwd: projectPath,
        timeout: 180000,
      });

      const duration = Date.now() - startTime;
      const output = stdout + stderr;
      const issuesFound = (output.match(/error TS/g) || []).length;

      this.events.emit('skill:stage-completed', {
        skill: 'cicd',
        stage: 'typecheck',
        duration,
        issuesFound,
      });

      return {
        stage: 'typecheck',
        success: true,
        output,
        duration,
        issuesFound,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:stage-failed', {
        skill: 'cicd',
        stage: 'typecheck',
        error: errorMessage,
        duration,
      });

      return {
        stage: 'typecheck',
        success: false,
        error: errorMessage,
        duration,
        issuesFound: (errorMessage.match(/error TS/g) || []).length,
      };
    }
  }

  /**
   * Run tests stage
   */
  private async runTestsStage(projectPath: string): Promise<StageResult> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:stage-started', {
        skill: 'cicd',
        stage: 'tests',
      });

      const { stdout, stderr } = await execAsync('npm run test', {
        cwd: projectPath,
        timeout: 300000,
      });

      const duration = Date.now() - startTime;
      const output = stdout + stderr;

      // Parse test results
      const failed = (output.match(/failed\s+\d+/g) || [])[0];
      const issuesFound = failed ? parseInt(failed.split(/\s+/)[1]) : 0;

      this.events.emit('skill:stage-completed', {
        skill: 'cicd',
        stage: 'tests',
        duration,
        issuesFound,
      });

      return {
        stage: 'tests',
        success: issuesFound === 0,
        output,
        duration,
        issuesFound,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:stage-failed', {
        skill: 'cicd',
        stage: 'tests',
        error: errorMessage,
        duration,
      });

      return {
        stage: 'tests',
        success: false,
        error: errorMessage,
        duration,
        issuesFound: 1,
      };
    }
  }

  /**
   * Run build stage
   */
  private async runBuildStage(projectPath: string): Promise<StageResult> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:stage-started', {
        skill: 'cicd',
        stage: 'build',
      });

      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: projectPath,
        timeout: 300000,
      });

      const duration = Date.now() - startTime;
      const output = stdout + stderr;

      this.events.emit('skill:stage-completed', {
        skill: 'cicd',
        stage: 'build',
        duration,
      });

      return {
        stage: 'build',
        success: true,
        output,
        duration,
        issuesFound: 0,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:stage-failed', {
        skill: 'cicd',
        stage: 'build',
        error: errorMessage,
        duration,
      });

      return {
        stage: 'build',
        success: false,
        error: errorMessage,
        duration,
        issuesFound: 1,
      };
    }
  }

  /**
   * Run E2E tests stage
   */
  private async runE2EStage(projectPath: string): Promise<StageResult> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:stage-started', {
        skill: 'cicd',
        stage: 'e2e',
      });

      // Check if Playwright is configured
      const { stdout } = await execAsync('npx playwright --version 2>&1', {
        cwd: projectPath,
        timeout: 10000,
      });

      if (!stdout.includes('Version')) {
        // Playwright not configured, skip
        const duration = Date.now() - startTime;

        this.events.emit('skill:stage-skipped', {
          skill: 'cicd',
          stage: 'e2e',
          reason: 'Playwright not configured',
        });

        return {
          stage: 'e2e',
          success: true,
          output: 'E2E tests skipped (Playwright not configured)',
          duration,
          issuesFound: 0,
        };
      }

      const { stdout: testOutput, stderr } = await execAsync('npx playwright test', {
        cwd: projectPath,
        timeout: 600000,
      });

      const duration = Date.now() - startTime;
      const output = testOutput + stderr;

      this.events.emit('skill:stage-completed', {
        skill: 'cicd',
        stage: 'e2e',
        duration,
      });

      return {
        stage: 'e2e',
        success: true,
        output,
        duration,
        issuesFound: 0,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      // Check if it's just not configured
      if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
        this.events.emit('skill:stage-skipped', {
          skill: 'cicd',
          stage: 'e2e',
          reason: 'Playwright not available',
        });

        return {
          stage: 'e2e',
          success: true,
          output: 'E2E tests skipped (Playwright not available)',
          duration,
          issuesFound: 0,
        };
      }

      this.events.emit('skill:stage-failed', {
        skill: 'cicd',
        stage: 'e2e',
        error: errorMessage,
        duration,
      });

      return {
        stage: 'e2e',
        success: false,
        error: errorMessage,
        duration,
        issuesFound: 1,
      };
    }
  }

  /**
   * Run security scanning stage
   */
  private async runSecurityStage(projectPath: string): Promise<StageResult> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:stage-started', {
        skill: 'cicd',
        stage: 'security',
      });

      // Run npm audit
      const { stdout } = await execAsync('npm audit --json', {
        cwd: projectPath,
        timeout: 60000,
      });

      const duration = Date.now() - startTime;
      const auditResult = JSON.parse(stdout);
      const vulnerabilities = auditResult.metadata?.vulnerabilities;
      const issuesFound =
        (vulnerabilities?.low || 0) +
        (vulnerabilities?.moderate || 0) +
        (vulnerabilities?.high || 0) +
        (vulnerabilities?.critical || 0);

      this.events.emit('skill:stage-completed', {
        skill: 'cicd',
        stage: 'security',
        duration,
        issuesFound,
      });

      return {
        stage: 'security',
        success: issuesFound === 0,
        output: JSON.stringify(auditResult, null, 2),
        duration,
        issuesFound,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:stage-failed', {
        skill: 'cicd',
        stage: 'security',
        error: errorMessage,
        duration,
      });

      return {
        stage: 'security',
        success: false,
        error: errorMessage,
        duration,
        issuesFound: 1,
      };
    }
  }

  /**
   * Generate HTML report
   */
  private async generateReport(
    projectPath: string,
    reportDir: string,
    stages: CICDResult['stages']
  ): Promise<string> {
    const reportPath = path.join(projectPath, reportDir, `cicd-report-${Date.now()}.html`);

    // Ensure report directory exists
    await secureFs.mkdir(path.dirname(reportPath), { recursive: true });

    // Generate HTML report
    const html = this.generateHTMLReport(stages);

    await secureFs.writeFile(reportPath, html, 'utf-8');

    return reportPath;
  }

  /**
   * Generate HTML report content
   */
  private generateHTMLReport(stages: CICDResult['stages']): string {
    const overallSuccess = Object.values(stages).every((s) => s.success);

    let stagesHtml = '';
    for (const [name, result] of Object.entries(stages)) {
      const statusClass = result.success ? 'success' : 'failure';
      const statusIcon = result.success ? '✓' : '✗';
      const issuesCount = result.issuesFound || 0;

      stagesHtml += `
        <div class="stage ${statusClass}">
          <h3>${statusIcon} ${name.toUpperCase()}</h3>
          <div class="details">
            <div class="duration">Duration: ${result.duration}ms</div>
            <div class="issues">Issues: ${issuesCount}</div>
            ${result.error ? `<div class="error">${this.escapeHtml(result.error)}</div>` : ''}
          </div>
        </div>
      `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CI/CD Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header.success {
      border-left: 5px solid #4caf50;
    }
    .header.failure {
      border-left: 5px solid #f44336;
    }
    .status {
      font-size: 48px;
      margin: 10px 0;
    }
    .stage {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 15px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .stage.success {
      border-left: 4px solid #4caf50;
    }
    .stage.failure {
      border-left: 4px solid #f44336;
    }
    .stage h3 {
      margin: 0 0 10px 0;
      color: #333;
    }
    .details {
      color: #666;
      font-size: 14px;
    }
    .error {
      background: #ffebee;
      color: #c62828;
      padding: 10px;
      border-radius: 4px;
      margin-top: 10px;
      font-family: monospace;
      white-space: pre-wrap;
    }
    .timestamp {
      color: #999;
      font-size: 12px;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="header ${overallSuccess ? 'success' : 'failure'}">
    <h1>CI/CD Pipeline Report</h1>
    <div class="status">${overallSuccess ? '✓ PASSED' : '✗ FAILED'}</div>
    <div class="timestamp">Generated: ${new Date().toISOString()}</div>
  </div>
  ${stagesHtml}
</body>
</html>`;
  }

  /**
   * Auto-commit changes
   */
  private async autoCommitChanges(
    projectPath: string,
    message: string
  ): Promise<string | undefined> {
    try {
      // Stage all changes
      await execAsync('git add .', { cwd: projectPath });

      // Commit
      const { stdout } = await execAsync(`git commit -m "${message}"`, {
        cwd: projectPath,
      });

      // Extract commit hash
      const match = stdout.match(/\[([a-f0-9]+)\]/);
      return match ? match[1] : undefined;
    } catch (error) {
      // Git operations may fail if no changes or git not configured
      console.error('[CICDSkill] Auto-commit failed:', error);
      return undefined;
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Check if the CI/CD skill is available
   */
  isAvailable(): boolean {
    // CI/CD skill is always available (just runs npm commands)
    return true;
  }

  /**
   * Execute CI/CD validation - main entry point for API
   */
  async executeCICD(
    projectPath: string,
    options?: {
      skipE2E?: boolean;
      autoCommit?: boolean;
      reportFormat?: 'html' | 'json';
    }
  ): Promise<CICDResult> {
    const stages = ['lint', 'typecheck', 'tests', 'build'];
    if (!options?.skipE2E) {
      stages.push('e2e');
    }
    stages.push('security');

    return this.execute({
      projectPath,
      stages: stages as ('lint' | 'typecheck' | 'tests' | 'build' | 'e2e' | 'security')[],
      generateReport: true,
      autoCommit: options?.autoCommit || false,
    });
  }
}
