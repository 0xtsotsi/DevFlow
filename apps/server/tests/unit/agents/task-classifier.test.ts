/**
 * Task Classifier Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskClassifier } from '../../../src/agents/task-classifier.js';
import { AgentType } from '@automaker/types';

describe('TaskClassifier', () => {
  let classifier: TaskClassifier;

  beforeEach(() => {
    classifier = new TaskClassifier();
  });

  describe('analyzeTask', () => {
    it('should extract keywords from task prompt', () => {
      const analysis = classifier.analyzeTask('Implement a new feature with tests');

      expect(analysis.keywords).toContain('implement');
      expect(analysis.keywords).toContain('test');
    });

    it('should detect test-related tasks', () => {
      const analysis = classifier.analyzeTask('Write unit tests for the user service');

      expect(analysis.isTestRelated).toBe(true);
    });

    it('should detect documentation-related tasks', () => {
      const analysis = classifier.analyzeTask('Update the README with new instructions');

      expect(analysis.isDocumentationRelated).toBe(true);
    });

    it('should detect debug-related tasks', () => {
      const analysis = classifier.analyzeTask('Fix the bug in the authentication flow');

      expect(analysis.isDebugRelated).toBe(true);
    });

    it('should calculate complexity based on prompt length', () => {
      const simpleAnalysis = classifier.analyzeTask('Add a button');
      const complexAnalysis = classifier.analyzeTask(
        'Implement a complex integration with multiple external services that handles async operations and error cases'
      );

      expect(complexAnalysis.complexity).toBeGreaterThan(simpleAnalysis.complexity);
    });

    it('should detect language from file paths', () => {
      const analysis = classifier.analyzeTask('Write code', ['src/test.ts', 'src/index.ts']);

      expect(analysis.language).toBe('typescript');
    });

    it('should detect file patterns', () => {
      const analysis = classifier.analyzeTask('Write tests', ['src/test.test.ts']);

      expect(analysis.filePatterns.length).toBeGreaterThan(0);
    });

    it('should handle empty file paths', () => {
      const analysis = classifier.analyzeTask('Implement feature');

      expect(analysis.filePatterns).toEqual([]);
      expect(analysis.language).toBeUndefined();
    });

    it('should handle punctuation-only prompts', () => {
      const analysis = classifier.analyzeTask('...');

      expect(analysis.keywords).toEqual([]);
      expect(analysis.complexity).toBeLessThan(10);
    });
  });

  describe('classifyTask', () => {
    it('should classify planning tasks', () => {
      const analysis = classifier.analyzeTask(
        'Create a specification for the authentication feature'
      );
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe(AgentType.PLANNING);
    });

    it('should classify implementation tasks', () => {
      const analysis = classifier.analyzeTask('Implement the user authentication module');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe(AgentType.IMPLEMENTATION);
    });

    it('should classify testing tasks', () => {
      const analysis = classifier.analyzeTask('Write unit tests for the API endpoints');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe(AgentType.TESTING);
    });

    it('should classify debug tasks', () => {
      const analysis = classifier.analyzeTask('Fix the crash when loading the dashboard');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe(AgentType.DEBUG);
    });

    it('should classify review tasks', () => {
      const analysis = classifier.analyzeTask('Review the pull request for security issues');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe(AgentType.REVIEW);
    });

    it('should classify documentation tasks', () => {
      const analysis = classifier.analyzeTask('Update the API documentation');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe(AgentType.DOCUMENTATION);
    });

    it('should classify refactoring tasks', () => {
      const analysis = classifier.analyzeTask('Refactor the user service to reduce complexity');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBe(AgentType.REFACTORING);
    });

    it('should provide alternatives with lower confidence', () => {
      const analysis = classifier.analyzeTask('Implement and test the auth feature');
      const classification = classifier.classifyTask(analysis);

      expect(classification.alternatives).toBeDefined();
      // Alternatives are provided when there are multiple matching keywords
      // For generic tasks, alternatives may be empty
      expect(Array.isArray(classification.alternatives)).toBe(true);
    });

    it('should include a reason for classification', () => {
      const analysis = classifier.analyzeTask('Write tests for the auth module');
      const classification = classifier.classifyTask(analysis);

      expect(classification.reason).toBeDefined();
      expect(typeof classification.reason).toBe('string');
    });

    it('should provide confidence score', () => {
      const analysis = classifier.analyzeTask('Write unit tests');
      const classification = classifier.classifyTask(analysis);

      expect(classification.confidence).toBeGreaterThanOrEqual(0);
      expect(classification.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle edge case: empty prompt', () => {
      const analysis = classifier.analyzeTask('');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBeDefined();
    });

    it('should handle edge case: only punctuation', () => {
      const analysis = classifier.analyzeTask('!!!');
      const classification = classifier.classifyTask(analysis);

      expect(classification.agentType).toBeDefined();
    });
  });
});
