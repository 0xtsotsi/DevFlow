import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CheckpointService, type AgentState } from '@/services/checkpoint-service.js';
import * as secureFs from '@/lib/secure-fs.js';
import { rm } from 'fs/promises';
import path from 'path';

describe('CheckpointService', () => {
  const testProjectPath = '/tmp/test-checkpoint-project';
  let service: CheckpointService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new CheckpointService(testProjectPath);

    // Mock fs operations
    vi.mock('@/lib/secure-fs.js');
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testProjectPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createCheckpoint', () => {
    it('should create a new checkpoint with valid data', async () => {
      const checkpointId = 'cp-test-001';
      const agents = [
        {
          agentId: 'agent-1',
          status: 'running' as const,
          taskHistory: [
            {
              taskId: 'T001',
              description: 'Create user model',
              status: 'completed' as const,
              startTime: '2024-01-01T00:00:00Z',
              endTime: '2024-01-01T00:05:00Z',
            },
          ],
        },
      ];

      const state: AgentState = {
        featureId: 'feature-1',
        taskHistory: agents[0].taskHistory,
        filesModified: ['src/models/user.ts'],
        context: 'Test context',
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(secureFs, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(secureFs, 'access').mockRejectedValue(new Error('File not found'));
      vi.spyOn(secureFs, 'writeFile').mockResolvedValue(undefined);

      const checkpoint = await service.createCheckpoint(
        checkpointId,
        agents,
        state,
        'Test checkpoint'
      );

      expect(checkpoint).toBeDefined();
      expect(checkpoint.checkpointId).toBe(checkpointId);
      expect(checkpoint.featureId).toBe('feature-1');
      expect(checkpoint.version).toBe(1);
      expect(checkpoint.agents).toHaveLength(1);
      expect(checkpoint.description).toBe('Test checkpoint');
    });

    it('should increment version for subsequent checkpoints', async () => {
      const state: AgentState = {
        featureId: 'feature-1',
        taskHistory: [],
        filesModified: [],
        context: 'Test',
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(secureFs, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(secureFs, 'access').mockRejectedValue(new Error('File not found'));
      vi.spyOn(secureFs, 'writeFile').mockResolvedValue(undefined);
      vi.spyOn(secureFs, 'readdir').mockResolvedValue([] as any);

      // Create first checkpoint
      const cp1 = await service.createCheckpoint('cp-001', [], state);
      expect(cp1.version).toBe(1);

      // Mock readdir to return existing checkpoint
      vi.spyOn(secureFs, 'readdir').mockResolvedValue([
        { name: 'cp-001.json', isFile: () => true, isDirectory: () => false },
      ] as any);

      // Mock file read for version detection
      vi.spyOn(secureFs, 'readFile').mockResolvedValue(JSON.stringify(cp1));

      // Create second checkpoint
      const cp2 = await service.createCheckpoint('cp-002', [], state);
      expect(cp2.version).toBe(2);
    });

    it('should throw error if checkpoint already exists', async () => {
      const checkpointId = 'cp-duplicate';
      const state: AgentState = {
        featureId: 'feature-1',
        taskHistory: [],
        filesModified: [],
        context: 'Test',
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(secureFs, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(secureFs, 'access').mockResolvedValue(undefined);

      await expect(service.createCheckpoint(checkpointId, [], state)).rejects.toThrow(
        'already exists'
      );
    });
  });

  describe('restoreCheckpoint', () => {
    it('should restore an existing checkpoint', async () => {
      const checkpointId = 'cp-restore-001';
      const expectedCheckpoint = {
        checkpointId,
        featureId: 'feature-1',
        createdAt: new Date().toISOString(),
        version: 1,
        agents: [],
        state: {
          featureId: 'feature-1',
          taskHistory: [],
          filesModified: [],
          context: 'Test',
          timestamp: new Date().toISOString(),
        },
      };

      vi.spyOn(secureFs, 'readFile').mockResolvedValue(JSON.stringify(expectedCheckpoint));

      const restored = await service.restoreCheckpoint(checkpointId);

      expect(restored).toEqual(expectedCheckpoint);
    });

    it('should throw error for non-existent checkpoint', async () => {
      const checkpointId = 'cp-nonexistent';

      vi.spyOn(secureFs, 'readFile').mockRejectedValue(new Error('File not found'));

      await expect(service.restoreCheckpoint(checkpointId)).rejects.toThrow(
        'Failed to restore checkpoint'
      );
    });
  });

  describe('listCheckpoints', () => {
    it('should list all checkpoints when no filter provided', async () => {
      const checkpoints = [
        {
          checkpointId: 'cp-001',
          featureId: 'feature-1',
          createdAt: '2024-01-01T00:00:00Z',
          version: 1,
          agents: [],
          state: {} as AgentState,
        },
        {
          checkpointId: 'cp-002',
          featureId: 'feature-2',
          createdAt: '2024-01-02T00:00:00Z',
          version: 1,
          agents: [],
          state: {} as AgentState,
        },
      ];

      vi.spyOn(secureFs, 'readdir').mockResolvedValue([
        { name: 'cp-001.json', isFile: () => true },
        { name: 'cp-002.json', isFile: () => true },
      ] as any);

      vi.spyOn(secureFs, 'readFile').mockImplementation((path: string) => {
        const id = path.toString().includes('cp-001') ? 0 : 1;
        return Promise.resolve(JSON.stringify(checkpoints[id]));
      });

      const listed = await service.listCheckpoints();

      expect(listed).toHaveLength(2);
      expect(listed[0].checkpointId).toBe('cp-002'); // Newest first
      expect(listed[1].checkpointId).toBe('cp-001');
    });

    it('should filter checkpoints by featureId', async () => {
      const checkpoints = [
        {
          checkpointId: 'cp-001',
          featureId: 'feature-1',
          createdAt: '2024-01-01T00:00:00Z',
          version: 1,
          agents: [],
          state: {} as AgentState,
        },
        {
          checkpointId: 'cp-002',
          featureId: 'feature-2',
          createdAt: '2024-01-02T00:00:00Z',
          version: 1,
          agents: [],
          state: {} as AgentState,
        },
      ];

      vi.spyOn(secureFs, 'readdir').mockResolvedValue([
        { name: 'cp-001.json', isFile: () => true },
        { name: 'cp-002.json', isFile: () => true },
      ] as any);

      vi.spyOn(secureFs, 'readFile').mockImplementation((path: string) => {
        const id = path.toString().includes('cp-001') ? 0 : 1;
        return Promise.resolve(JSON.stringify(checkpoints[id]));
      });

      const listed = await service.listCheckpoints('feature-1');

      expect(listed).toHaveLength(1);
      expect(listed[0].featureId).toBe('feature-1');
    });

    it('should return empty array when no checkpoints exist', async () => {
      vi.spyOn(secureFs, 'readdir').mockRejectedValue(new Error('Directory not found'));

      const listed = await service.listCheckpoints();

      expect(listed).toEqual([]);
    });
  });

  describe('deleteCheckpoint', () => {
    it('should delete an existing checkpoint', async () => {
      const checkpointId = 'cp-delete-001';

      vi.spyOn(secureFs, 'unlink').mockResolvedValue(undefined);

      await expect(service.deleteCheckpoint(checkpointId)).resolves.not.toThrow();
    });

    it('should throw error when delete fails', async () => {
      const checkpointId = 'cp-delete-fail';

      vi.spyOn(secureFs, 'unlink').mockRejectedValue(new Error('Permission denied'));

      await expect(service.deleteCheckpoint(checkpointId)).rejects.toThrow(
        'Failed to delete checkpoint'
      );
    });
  });

  describe('diffCheckpoints', () => {
    it('should create diff between two checkpoints', async () => {
      const cp1 = {
        checkpointId: 'cp-001',
        featureId: 'feature-1',
        createdAt: '2024-01-01T00:00:00Z',
        version: 1,
        agents: [],
        state: {
          featureId: 'feature-1',
          taskHistory: [],
          filesModified: ['src/file1.ts', 'src/file2.ts'],
          context: 'CP1',
          timestamp: '2024-01-01T00:00:00Z',
        } as AgentState,
      };

      const cp2 = {
        checkpointId: 'cp-002',
        featureId: 'feature-1',
        createdAt: '2024-01-02T00:00:00Z',
        version: 2,
        agents: [],
        state: {
          featureId: 'feature-1',
          taskHistory: [],
          filesModified: ['src/file1.ts', 'src/file3.ts'],
          context: 'CP2',
          timestamp: '2024-01-02T00:00:00Z',
        } as AgentState,
      };

      vi.spyOn(service, 'restoreCheckpoint').mockImplementation((id) => {
        return Promise.resolve(id === 'cp-001' ? cp1 : cp2);
      });

      const diff = await service.diffCheckpoints('cp-001', 'cp-002');

      expect(diff.checkpointId).toBe('cp-002');
      expect(diff.changes).toHaveLength(3);

      const added = diff.changes.find((c) => c.type === 'added');
      expect(added?.path).toBe('src/file3.ts');

      const deleted = diff.changes.find((c) => c.type === 'deleted');
      expect(deleted?.path).toBe('src/file2.ts');

      const modified = diff.changes.find((c) => c.type === 'modified');
      expect(modified?.path).toBe('src/file1.ts');
    });
  });

  describe('mergeCheckpoints', () => {
    it('should create merge plan for two checkpoints', async () => {
      const source = {
        checkpointId: 'cp-source',
        featureId: 'feature-1',
        createdAt: '2024-01-01T00:00:00Z',
        version: 1,
        agents: [
          {
            agentId: 'agent-1',
            status: 'completed' as const,
            taskHistory: [
              {
                taskId: 'T001',
                description: 'Task 1',
                status: 'completed' as const,
              },
            ],
          },
        ],
        state: {
          featureId: 'feature-1',
          taskHistory: [],
          filesModified: ['src/file1.ts'],
          context: 'Source',
          timestamp: '2024-01-01T00:00:00Z',
        } as AgentState,
      };

      const target = {
        checkpointId: 'cp-target',
        featureId: 'feature-1',
        createdAt: '2024-01-02T00:00:00Z',
        version: 2,
        agents: [],
        state: {
          featureId: 'feature-1',
          taskHistory: [],
          filesModified: ['src/file2.ts'],
          context: 'Target',
          timestamp: '2024-01-02T00:00:00Z',
        } as AgentState,
      };

      vi.spyOn(service, 'restoreCheckpoint').mockImplementation((id) => {
        return Promise.resolve(id === 'cp-source' ? source : target);
      });

      const merge = await service.mergeCheckpoints('cp-source', 'cp-target');

      expect(merge.source).toEqual(source);
      expect(merge.target).toEqual(target);
      expect(merge.mergePlan).toHaveLength(2);
      expect(merge.mergePlan[0]).toContain('Add file: src/file1.ts');
      expect(merge.mergePlan[1]).toContain('Restore task: T001');
    });
  });

  describe('getCheckpointLineage', () => {
    it('should return checkpoints sorted by version', async () => {
      const checkpoints = [
        {
          checkpointId: 'cp-001',
          featureId: 'feature-1',
          createdAt: '2024-01-01T00:00:00Z',
          version: 1,
          agents: [],
          state: {} as AgentState,
        },
        {
          checkpointId: 'cp-002',
          featureId: 'feature-1',
          createdAt: '2024-01-02T00:00:00Z',
          version: 2,
          agents: [],
          state: {} as AgentState,
        },
        {
          checkpointId: 'cp-003',
          featureId: 'feature-1',
          createdAt: '2024-01-03T00:00:00Z',
          version: 3,
          agents: [],
          state: {} as AgentState,
        },
      ];

      vi.spyOn(service, 'listCheckpoints').mockResolvedValue(checkpoints as any);

      const lineage = await service.getCheckpointLineage('feature-1');

      expect(lineage).toHaveLength(3);
      expect(lineage[0].version).toBe(1);
      expect(lineage[1].version).toBe(2);
      expect(lineage[2].version).toBe(3);
    });
  });
});
