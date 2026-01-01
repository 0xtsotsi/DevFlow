/**
 * Task Classifier Tests
 */

import { describe, it, expect } from 'vitest';
import { TaskClassifier } from '../../../src/agents/task-classifier.js';
import type { AgentType } from '@automaker/types';

describe('TaskClassifier', () => {
  const classifier = new TaskClassifier();

  describe('analyzeTask', () => {
    it('should extract keywords from a prompt', () => {
      const analysis = classifier.analyzeTask(
        'Implement a user authentication system with JWT tokens'
      );

      expect(analysis.keywords).toContain('implement');
      expect(analysis.keywords).toContain('authentication');
      expect(analysis.keywords).toContain('tokens');
    });

    it('should detect programming languages', () => {
      const analysis = classifier.analyzeTask('Write a TypeScript function to validate data', [
        'src/utils/validator.ts',
        'src/types/user.ts',
      ]);

      expect(analysis.languages).toContain('TypeScript');
    });

    it('should detect file types', () => {
      const analysis = classifier.analyzeTask('Test the authentication module', [
        'src/auth.test.ts',
        'src/utils.ts',
        'README.md',
      ]);

      expect(analysis.fileTypes).toContain('test');
      expect(analysis.fileTypes).toContain('code');
      expect(analysis.fileTypes).toContain('documentation');
    });

    it('should assess complexity as simple for short prompts', () => {
      const analysis = classifier.analyzeTask('Add a simple button');

      expect(analysis.complexity).toBe('simple');
    });

    it('should assess complexity as complex for long prompts', () => {
      const longPrompt = `
        Design and implement a comprehensive microservices architecture
        with multiple interconnected services, API gateways, authentication
        systems, databases, caching layers, and monitoring solutions.
        Include detailed documentation, testing strategies, and deployment
        pipelines for each service.
      `.repeat(2);

      const analysis = classifier.analyzeTask(longPrompt);

      expect(analysis.complexity).toBe('complex');
    });

    it('should detect code creation tasks', () => {
      const analysis = classifier.analyzeTask('Implement a new feature');

      expect(analysis.involvesCode).toBe(true);
    });

    it('should detect testing tasks', () => {
      const analysis = classifier.analyzeTask('Write tests for the auth module');

      expect(analysis.involvesTesting).toBe(true);
    });

    it('should detect documentation tasks', () => {
      const analysis = classifier.analyzeTask('Update the README with new instructions');

      expect(analysis.involvesDocs).toBe(true);
    });

    it('should detect debugging tasks', () => {
      const analysis = classifier.analyzeTask('Fix the bug in the authentication flow');

      expect(analysis.involvesDebugging).toBe(true);
    });
  });

  describe('classifyTask', () => {
    it('should classify planning tasks', () => {
      const analysis = classifier.analyzeTask('Create a specification for the new feature');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe('planning');
      expect(classification.confidence).toBeGreaterThan(0.5);
    });

    it('should classify implementation tasks', () => {
      const analysis = classifier.analyzeTask('Implement the user authentication system');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe('implementation');
      expect(classification.confidence).toBeGreaterThan(0.5);
    });

    it('should classify testing tasks', () => {
      const analysis = classifier.analyzeTask('Write comprehensive tests for the API');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe('testing');
      expect(classification.confidence).toBeGreaterThan(0.5);
    });

    it('should classify review tasks', () => {
      const analysis = classifier.analyzeTask('Review the code for security issues');
      const classification = classifier.classifyTask(analysis);

      expect(['review', 'generic']).toContain(classification.agentType);
    });

    it('should classify debug tasks', () => {
      const analysis = classifier.analyzeTask('Fix the error in the login handler');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe('debug');
      expect(classification.confidence).toBeGreaterThan(0.5);
    });

    it('should classify documentation tasks', () => {
      const analysis = classifier.analyzeTask('Update the documentation for the API');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe('documentation');
      expect(classification.confidence).toBeGreaterThan(0.5);
    });

    it('should classify refactoring tasks', () => {
      const analysis = classifier.analyzeTask('Refactor the user service to reduce complexity');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe('refactoring');
      expect(classification.confidence).toBeGreaterThan(0.5);
    });

    it('should provide alternative agent suggestions', () => {
      const analysis = classifier.analyzeTask('Write tests and implement the feature');
      const classification = classifier.classifyTask(analysis);

      expect(classification.alternatives.length).toBeGreaterThan(0);
      expect(classification.alternatives[0]).toHaveProperty('type');
      expect(classification.alternatives[0]).toHaveProperty('confidence');
    });

    it('should fallback to generic agent for unclear tasks', () => {
      const analysis = classifier.analyzeTask('Help me with something');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe('generic');
    });

    it('should boost confidence for debugging keywords', () => {
      const analysis = classifier.analyzeTask('Fix the critical bug in production');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe('debug');
      expect(classification.confidence).toBeGreaterThan(0.7);
    });

    it('should boost confidence for testing keywords', () => {
      const analysis = classifier.analyzeTask('Verify the functionality with unit tests');
      const classification = classifier.classifyTask(analysis);

      expect(['testing', 'implementation']).toContain(classification.agentType);
    });
  });

  describe('edge cases', () => {
    it('should handle empty prompts', () => {
      const analysis = classifier.analyzeTask('');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe('generic');
    });

    it('should handle prompts with only punctuation', () => {
      const analysis = classifier.analyzeTask('!!! ??? ...');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe('generic');
    });

    it('should handle very long prompts', () => {
      const longPrompt = 'implement feature '.repeat(1000);
      const analysis = classifier.analyzeTask(longPrompt);
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe('implementation');
    });

    it('should handle prompts with mixed languages and frameworks', () => {
      const analysis = classifier.analyzeTask(
        'Create a React component with TypeScript and integrate with the Express backend',
        ['src/components/User.tsx', 'server/api/users.ts']
      );

      expect(analysis.frameworks).toContain('React');
      expect(analysis.languages).toContain('TypeScript');
      expect(analysis.fileTypes).toContain('code');
    });
  });
});
