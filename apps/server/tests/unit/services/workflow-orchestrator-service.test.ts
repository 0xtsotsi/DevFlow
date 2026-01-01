import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { WorkflowOrchestratorService } from '@/services/workflow-orchestrator-service.js';

describe('WorkflowOrchestratorService', () => {
  let service: WorkflowOrchestratorService;
  let mockEvents: EventEmitter;

  beforeEach(() => {
    mockEvents = new EventEmitter();
    service = new WorkflowOrchestratorService(mockEvents);
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute workflow and return result', async () => {
      const result = await service.execute({
        projectPath: '/test',
        task: 'Test task',
        mode: 'auto',
        phases: [], // Skip all phases for testing
      });

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.phases).toBeDefined();
      expect(result.checkpoints).toEqual([]);
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      // Test with semi mode which requires checkpoints
      const result = service.execute({
        projectPath: '/test',
        task: 'Test task',
        mode: 'semi',
        phases: [], // Skip all phases for testing
      });

      // Should not throw even in semi mode with no phases
      await expect(result).resolves.toBeDefined();
    });
  });

  describe('isAvailable', () => {
    it('should return availability status (boolean)', () => {
      const available = service.isAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('approveCheckpoint', () => {
    it('should return false for non-existent workflow', () => {
      const result = service.approveCheckpoint('non-existent', 'cp-1');
      expect(result).toBe(false);
    });
  });

  describe('rejectCheckpoint', () => {
    it('should return false for non-existent workflow', () => {
      const result = service.rejectCheckpoint('non-existent', 'cp-1');
      expect(result).toBe(false);
    });
  });
});
