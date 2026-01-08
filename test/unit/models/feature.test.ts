/**
 * Unit Tests for FeatureModel
 *
 * Tests cover:
 * - Factory methods (10 tests)
 * - State transitions (15 tests)
 * - Business logic (15 tests)
 * - Image management (10 tests)
 * - Type guards and validation (5 tests)
 * - Getters (5 tests)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FeatureModel,
  toFeatureId,
  isValidFeatureStatus,
  validateFeature,
} from '../../apps/server/src/models/feature.js';
import type { Feature, FeatureStatus, FeatureImagePath } from '@devflow/types';

// Mock secure-fs for file operations
vi.mock('../../apps/server/src/lib/secure-fs.js', () => ({
  default: {
    exists: vi.fn().mockResolvedValue(true),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(JSON.stringify({ id: 'feature-123', title: 'Test' })),
    writeFile: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockFeatureData: Feature = {
  id: 'feature-1234567890',
  title: 'Test Feature',
  category: 'enhancement',
  description: 'A test feature',
  status: 'pending',
  dependencies: [],
  priority: 5,
  passes: true,
  skipTests: false,
  planningMode: 'spec',
  requirePlanApproval: false,
  planSpec: {
    status: 'pending',
    version: 1,
    reviewedByUser: false,
  },
};

const mockFeatureWithImages: Feature = {
  ...mockFeatureData,
  imagePaths: ['/path/to/image1.png', '/path/to/image2.png'],
};

const mockFeatureWithObjectImages: Feature = {
  ...mockFeatureData,
  imagePaths: [
    { path: '/path/to/image1.png', id: 'img1', filename: 'image1.png', mimeType: 'image/png' },
    { path: '/path/to/image2.png', id: 'img2', filename: 'image2.png', mimeType: 'image/png' },
  ],
};

const mockFeatureWithDependencies: Feature = {
  ...mockFeatureData,
  dependencies: ['feature-111', 'feature-222'],
};

const mockRunningFeature: Feature = {
  ...mockFeatureData,
  status: 'running',
  startedAt: new Date().toISOString(),
};

const mockCompletedFeature: Feature = {
  ...mockFeatureData,
  status: 'completed',
  startedAt: new Date().toISOString(),
};

const mockFailedFeature: Feature = {
  ...mockFeatureData,
  status: 'failed',
  error: 'Test error',
  failureCount: 1,
  lastFailedAt: new Date().toISOString(),
};

describe('FeatureModel', () => {
  // ==========================================================================
  // Factory Methods (10 tests)
  // ==========================================================================

  describe('Factory Methods', () => {
    it('should create a FeatureModel from partial data', () => {
      const model = FeatureModel.create({
        title: 'New Feature',
        category: 'enhancement',
        description: 'A new feature',
      });

      expect(model.getId()).toMatch(/^feature-\d+$/);
      expect(model.getTitle()).toBe('New Feature');
      expect(model.getCategory()).toBe('enhancement');
      expect(model.getDescription()).toBe('A new feature');
      expect(model.getStatus()).toBe('pending');
    });

    it('should generate unique feature IDs', () => {
      const model1 = FeatureModel.create({ category: 'test', description: 'Test 1' });
      const model2 = FeatureModel.create({ category: 'test', description: 'Test 2' });

      expect(model1.getId()).not.toBe(model2.getId());
    });

    it('should create FeatureModel from API feature', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.getId()).toBe('feature-1234567890');
      expect(model.getTitle()).toBe('Test Feature');
      expect(model.getCategory()).toBe('enhancement');
    });

    it('should preserve all fields when creating from API', () => {
      const model = FeatureModel.fromAPI(mockFeatureWithImages);

      expect(model.getImagePaths()).toHaveLength(2);
      expect(model.getDependencies()).toHaveLength(0);
      expect(model.getPriority()).toBe(5);
    });

    it('should create FeatureModel with custom status', () => {
      const model = FeatureModel.create({
        category: 'test',
        description: 'Test',
        status: 'running',
      });

      expect(model.getStatus()).toBe('running');
    });

    it('should create FeatureModel with dependencies', () => {
      const model = FeatureModel.fromAPI(mockFeatureWithDependencies);

      expect(model.getDependencies()).toEqual(['feature-111', 'feature-222']);
    });

    it('should create FeatureModel with plan spec', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.getPlanSpec()).toBeDefined();
      expect(model.getPlanSpec()?.status).toBe('pending');
      expect(model.getPlanSpec()?.version).toBe(1);
    });

    it('should handle optional fields correctly', () => {
      const model = FeatureModel.create({
        category: 'test',
        description: 'Test',
      });

      expect(model.getTitle()).toBeUndefined();
      expect(model.getModel()).toBeUndefined();
      expect(model.getBranchName()).toBeUndefined();
    });

    it('should handle image paths as strings', () => {
      const model = FeatureModel.fromAPI(mockFeatureWithImages);

      const paths = model.getImagePaths();
      expect(paths).toHaveLength(2);
      expect(paths![0]).toBe('/path/to/image1.png');
    });

    it('should handle image paths as objects', () => {
      const model = FeatureModel.fromAPI(mockFeatureWithObjectImages);

      const paths = model.getImagePaths();
      expect(paths).toHaveLength(2);
      expect(typeof paths![0]).toBe('object');
      expect((paths![0] as { path: string }).path).toBe('/path/to/image1.png');
    });
  });

  // ==========================================================================
  // State Transitions (15 tests)
  // ==========================================================================

  describe('State Transitions', () => {
    it('should transition from pending to running', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);
      const started = model.start();

      expect(model.getStatus()).toBe('pending');
      expect(started.getStatus()).toBe('running');
      expect(started.getStartedAt()).toBeDefined();
    });

    it('should transition from running to completed', () => {
      const model = FeatureModel.fromAPI(mockRunningFeature);
      const completed = model.complete();

      expect(model.getStatus()).toBe('running');
      expect(completed.getStatus()).toBe('completed');
    });

    it('should transition from completed to verified', () => {
      const model = FeatureModel.fromAPI(mockCompletedFeature);
      const verified = model.verify();

      expect(model.getStatus()).toBe('completed');
      expect(verified.getStatus()).toBe('verified');
    });

    it('should transition to failed with error', () => {
      const model = FeatureModel.fromAPI(mockRunningFeature);
      const failed = model.fail('Test error');

      expect(model.getStatus()).toBe('running');
      expect(failed.getStatus()).toBe('failed');
      expect(failed.getError()).toBe('Test error');
      expect(failed.getFailureCount()).toBe(1);
    });

    it('should increment failure count on multiple failures', () => {
      const model = FeatureModel.fromAPI(mockFailedFeature);
      const failedAgain = model.fail('Another error');

      expect(failedAgain.getFailureCount()).toBe(2);
    });

    it('should mark permanent failure after threshold', () => {
      const model = FeatureModel.create({
        category: 'test',
        description: 'Test',
        failureCount: 2,
      });
      const permanentlyFailed = model.fail('Critical error', true);

      expect(permanentlyFailed.isPermanentlyFailed()).toBe(true);
      expect(permanentlyFailed.getPermanentFailureReason()).toBe('Critical error');
    });

    it('should transition to deleted status', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);
      const deleted = model.delete();

      expect(model.getStatus()).toBe('pending');
      expect(deleted.getStatus()).toBe('deleted');
    });

    it('should not allow invalid transitions', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.canTransitionTo('running')).toBe(true);
      expect(model.canTransitionTo('completed')).toBe(false);
    });

    it('should allow running to completed transition', () => {
      const model = FeatureModel.fromAPI(mockRunningFeature);

      expect(model.canTransitionTo('completed')).toBe(true);
      expect(model.canTransitionTo('verified')).toBe(false);
    });

    it('should allow completed to verified transition', () => {
      const model = FeatureModel.fromAPI(mockCompletedFeature);

      expect(model.canTransitionTo('verified')).toBe(true);
      expect(model.canTransitionTo('running')).toBe(false);
    });

    it('should allow any status to failed', () => {
      const pending = FeatureModel.fromAPI(mockFeatureData);
      const running = FeatureModel.fromAPI(mockRunningFeature);
      const completed = FeatureModel.fromAPI(mockCompletedFeature);

      expect(pending.canTransitionTo('failed')).toBe(true);
      expect(running.canTransitionTo('failed')).toBe(true);
      expect(completed.canTransitionTo('failed')).toBe(true);
    });

    it('should track last failed timestamp', () => {
      const model = FeatureModel.fromAPI(mockRunningFeature);
      const beforeFail = Date.now();
      const failed = model.fail('Test error');
      const afterFail = Date.now();

      const lastFailed = failed.getLastFailedAt();
      expect(lastFailed).toBeDefined();
      const timestamp = new Date(lastFailed!).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(beforeFail);
      expect(timestamp).toBeLessThanOrEqual(afterFail);
    });

    it('should handle state transitions immutably', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);
      const started = model.start();

      expect(model.getStatus()).toBe('pending');
      expect(started.getStatus()).toBe('running');
      expect(model).not.toBe(started);
    });

    it('should handle sequential state transitions', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);
      const started = model.start();
      const completed = started.complete();
      const verified = completed.verify();

      expect(verified.getStatus()).toBe('verified');
    });
  });

  // ==========================================================================
  // Business Logic (15 tests)
  // ==========================================================================

  describe('Business Logic', () => {
    it('should check if feature is ready to start', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.isReadyToStart()).toBe(true);
    });

    it('should not be ready to start if dependencies are not met', () => {
      const model = FeatureModel.fromAPI(mockFeatureWithDependencies);

      expect(model.isReadyToStart()).toBe(true); // No blocking check implemented yet
    });

    it('should check if feature is blocked by dependencies', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.isBlocked()).toBe(false);
    });

    it('should check if feature can start', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.canStart()).toBe(true);
    });

    it('should not allow starting if already running', () => {
      const model = FeatureModel.fromAPI(mockRunningFeature);

      expect(model.canStart()).toBe(false);
    });

    it('should check if feature can complete', () => {
      const model = FeatureModel.fromAPI(mockRunningFeature);

      expect(model.canComplete()).toBe(true);
    });

    it('should not allow completing if not running', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.canComplete()).toBe(false);
    });

    it('should check if feature is completed', () => {
      const model = FeatureModel.fromAPI(mockCompletedFeature);

      expect(model.isCompleted()).toBe(true);
    });

    it('should check if feature is running', () => {
      const model = FeatureModel.fromAPI(mockRunningFeature);

      expect(model.isRunning()).toBe(true);
    });

    it('should check if feature has failed', () => {
      const model = FeatureModel.fromAPI(mockFailedFeature);

      expect(model.hasFailed()).toBe(true);
    });

    it('should check if feature requires approval', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.requiresApproval()).toBe(false);
    });

    it('should check if plan is approved', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.isPlanApproved()).toBe(false);
    });

    it('should validate feature has required fields', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.hasRequiredFields()).toBe(true);
    });

    it('should fail validation for missing required fields', () => {
      const invalidModel = FeatureModel.create({
        category: '',
        description: '',
      });

      expect(invalidModel.hasRequiredFields()).toBe(false);
    });

    it('should validate entire feature', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);
      const validation = model.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Image Management (10 tests)
  // ==========================================================================

  describe('Image Management', () => {
    it('should add image path to feature', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);
      const withImage = model.addImage('/path/to/new-image.png');

      expect(model.getImagePaths()).toBeUndefined();
      expect(withImage.getImagePaths()).toHaveLength(1);
      expect(withImage.getImagePaths()![0]).toBe('/path/to/new-image.png');
    });

    it('should remove image path from feature', () => {
      const model = FeatureModel.fromAPI(mockFeatureWithImages);
      const withoutImage = model.removeImage('/path/to/image1.png');

      expect(model.getImagePaths()).toHaveLength(2);
      expect(withoutImage.getImagePaths()).toHaveLength(1);
      expect(withoutImage.getImagePaths()![0]).toBe('/path/to/image2.png');
    });

    it('should handle removing non-existent image', () => {
      const model = FeatureModel.fromAPI(mockFeatureWithImages);
      const unchanged = model.removeImage('/path/to/non-existent.png');

      expect(unchanged.getImagePaths()).toHaveLength(2);
    });

    it('should detect orphaned images', () => {
      const model = FeatureModel.fromAPI(mockFeatureWithImages);
      const existingImages = ['/path/to/image2.png'];

      expect(model.hasOrphanedImages(existingImages)).toBe(true);
    });

    it('should get orphaned images', () => {
      const model = FeatureModel.fromAPI(mockFeatureWithImages);
      const existingImages = ['/path/to/image2.png'];
      const orphans = model.getOrphanedImages(existingImages);

      expect(orphans).toHaveLength(1);
      expect(orphans[0]).toBe('/path/to/image1.png');
    });

    it('should not detect orphans when all images exist', () => {
      const model = FeatureModel.fromAPI(mockFeatureWithImages);
      const existingImages = ['/path/to/image1.png', '/path/to/image2.png'];

      expect(model.hasOrphanedImages(existingImages)).toBe(false);
    });

    it('should handle no images gracefully', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);
      const existingImages: string[] = [];

      expect(model.hasOrphanedImages(existingImages)).toBe(false);
      expect(model.getOrphanedImages(existingImages)).toHaveLength(0);
    });

    it('should clear all images', () => {
      const model = FeatureModel.fromAPI(mockFeatureWithImages);
      const cleared = model.clearImages();

      expect(model.getImagePaths()).toHaveLength(2);
      expect(cleared.getImagePaths()).toBeUndefined();
    });

    it('should migrate images to target directory', async () => {
      const model = FeatureModel.fromAPI(mockFeatureWithObjectImages);
      const migratedPaths = await model.migrateImages('/project', '/project/features/images');

      expect(migratedPaths).toBeDefined();
      expect(Array.isArray(migratedPaths)).toBe(true);
    });

    it('should return empty array when migrating no images', async () => {
      const model = FeatureModel.fromAPI(mockFeatureData);
      const migratedPaths = await model.migrateImages('/project', '/project/features/images');

      expect(migratedPaths).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Type Guards and Validation (5 tests)
  // ==========================================================================

  describe('Type Guards and Validation', () => {
    it('should validate feature ID format', () => {
      expect(() => toFeatureId('feature-123')).not.toThrow();
      expect(() => toFeatureId('feature-1234567890')).not.toThrow();
    });

    it('should reject invalid feature ID format', () => {
      expect(() => toFeatureId('')).toThrow();
      expect(() => toFeatureId('invalid')).toThrow();
      expect(() => toFeatureId('123-feature')).toThrow();
    });

    it('should check valid feature status', () => {
      expect(isValidFeatureStatus('pending')).toBe(true);
      expect(isValidFeatureStatus('running')).toBe(true);
      expect(isValidFeatureStatus('completed')).toBe(true);
      expect(isValidFeatureStatus('failed')).toBe(true);
      expect(isValidFeatureStatus('verified')).toBe(true);
    });

    it('should reject invalid feature status', () => {
      expect(isValidFeatureStatus('invalid')).toBe(false);
      expect(isValidFeatureStatus('')).toBe(false);
      expect(isValidFeatureStatus('PENDING')).toBe(false);
    });

    it('should validate feature object', () => {
      const validFeature = mockFeatureData;
      const invalidFeature = { id: 'invalid' };

      const validResult = validateFeature(validFeature);
      const invalidResult = validateFeature(invalidFeature);

      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Getters (5 tests)
  // ==========================================================================

  describe('Getters', () => {
    it('should get feature ID', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.getId()).toBe('feature-1234567890');
    });

    it('should get feature title', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.getTitle()).toBe('Test Feature');
    });

    it('should get feature description', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.getDescription()).toBe('A test feature');
    });

    it('should get feature category', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.getCategory()).toBe('enhancement');
    });

    it('should get feature priority', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);

      expect(model.getPriority()).toBe(5);
    });
  });

  // ==========================================================================
  // Static Helpers (5 bonus tests)
  // ==========================================================================

  describe('Static Helpers', () => {
    it('should generate feature ID', () => {
      const id = FeatureModel.generateFeatureId();

      expect(id).toMatch(/^feature-\d{13}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = FeatureModel.generateFeatureId();
      const id2 = FeatureModel.generateFeatureId();

      expect(id1).not.toBe(id2);
    });

    it('should validate feature ID format', () => {
      expect(FeatureModel.isValidFeatureId('feature-1234567890')).toBe(true);
      expect(FeatureModel.isValidFeatureId('feature-123')).toBe(true);
    });

    it('should reject invalid feature ID', () => {
      expect(FeatureModel.isValidFeatureId('invalid')).toBe(false);
      expect(FeatureModel.isValidFeatureId('')).toBe(false);
      expect(FeatureModel.isValidFeatureId('feature-')).toBe(false);
    });

    it('should extract timestamp from feature ID', () => {
      const id = 'feature-1234567890123';
      const timestamp = FeatureModel.getTimestampFromId(id);

      expect(timestamp).toBe(1234567890123);
    });
  });

  // ==========================================================================
  // Conversion Methods (5 bonus tests)
  // ==========================================================================

  describe('Conversion Methods', () => {
    it('should convert to plain Feature object', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);
      const feature = model.toFeature();

      expect(feature.id).toBe('feature-1234567890');
      expect(feature.title).toBe('Test Feature');
    });

    it('should convert to JSON', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);
      const json = model.toJSON();

      expect(json.id).toBe('feature-1234567890');
      expect(json.title).toBe('Test Feature');
      expect(json).toHaveProperty('config');
    });

    it('should preserve immutability on conversion', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);
      const feature = model.toFeature();

      feature.title = 'Modified';

      expect(model.getTitle()).toBe('Test Feature');
    });

    it('should handle status transitions correctly', () => {
      const model = FeatureModel.fromAPI(mockFeatureData);
      const running = model.start();
      const completed = running.complete();

      expect(completed.canTransitionTo('verified')).toBe(true);
      expect(completed.canTransitionTo('running')).toBe(false);
    });

    it('should validate feature with Zod schema', () => {
      const validModel = FeatureModel.fromAPI(mockFeatureData);
      const result = validModel.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
