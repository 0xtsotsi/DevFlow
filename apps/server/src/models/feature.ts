/**
 * Feature Domain Model
 *
 * Rich domain model following Rails-style architecture principles.
 * Encapsulates feature data with behavior for state management,
 * image handling, validation, and transitions.
 *
 * Key Design Principles:
 * - Models do the work (behavior in model, not service)
 * - Runtime validation with Zod
 * - Branded types for type safety
 * - Single responsibility: Feature domain logic
 *
 * @see docs/RAILS_STYLE_ARCHITECTURE.md
 * @see PR1_AGENT_DOMAIN_MODEL_COMPLETE.md (AgentModel reference)
 */

import { z } from 'zod';
import type { Feature, FeatureStatus, FeatureImagePath, FeatureTextFilePath } from '@devflow/types';

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/**
 * Feature ID - uniquely identifies a feature instance
 * Format: feature-{timestamp}-{random}
 */
export type FeatureId = string & { readonly __brand: unique symbol };

/**
 * Validate and cast to FeatureId
 */
export function toFeatureId(id: string): FeatureId {
  if (!id || id.length === 0) {
    throw new Error('Feature ID cannot be empty');
  }
  if (!id.startsWith('feature-')) {
    throw new Error(`Invalid Feature ID format: ${id}. Must start with 'feature-'`);
  }
  return id as FeatureId;
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Zod schema for FeatureImagePath
 */
export const FeatureImagePathSchema = z
  .object({
    id: z.string(),
    path: z.string(),
    filename: z.string(),
    mimeType: z.string(),
  })
  .passthrough();

/**
 * Zod schema for FeatureTextFilePath
 */
export const FeatureTextFilePathSchema = z
  .object({
    id: z.string(),
    path: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    content: z.string(),
  })
  .passthrough();

/**
 * Zod schema for image paths (can be string or object)
 */
export const ImagePathSchema = z.union([
  z.string(),
  z
    .object({
      path: z.string(),
    })
    .passthrough(),
]);

/**
 * Zod schema for Feature
 */
export const FeatureSchema = z.object({
  id: z.string().startsWith('feature-'),
  title: z.string().optional(),
  titleGenerating: z.boolean().optional(),
  category: z.string(),
  description: z.string(),
  passes: z.boolean().optional(),
  priority: z.number().int().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'verified']).optional(),
  dependencies: z.array(z.string()).optional(),
  spec: z.string().optional(),
  model: z.string().optional(),
  imagePaths: z.array(ImagePathSchema).optional(),
  textFilePaths: z.array(FeatureTextFilePathSchema).optional(),
  branchName: z.string().optional(),
  skipTests: z.boolean().optional(),
  thinkingLevel: z.string().optional(),
  planningMode: z.enum(['skip', 'lite', 'spec', 'full']).optional(),
  requirePlanApproval: z.boolean().optional(),
  planSpec: z
    .object({
      status: z.enum(['pending', 'generating', 'generated', 'approved', 'rejected']),
      content: z.string().optional(),
      version: z.number(),
      generatedAt: z.string().optional(),
      approvedAt: z.string().optional(),
      reviewedByUser: z.boolean(),
      tasksCompleted: z.number().optional(),
      tasksTotal: z.number().optional(),
    })
    .optional(),
  error: z.string().optional(),
  summary: z.string().optional(),
  startedAt: z.string().optional(),
  failureCount: z.number().int().optional(),
  lastFailedAt: z.string().optional(),
  permanentlyFailed: z.boolean().optional(),
  permanentFailureReason: z.string().optional(),
});

// ============================================================================
// Feature Domain Model
// ============================================================================

/**
 * Feature Domain Model
 *
 * Rich domain model that encapsulates feature data with behavior.
 * Follows Rails-style "models do the work" principle.
 *
 * Key Responsibilities:
 * - State transitions and validation
 * - Image management (add, remove, migrate, orphan detection)
 * - Business logic (ready to start, completion checks, dependencies)
 * - Feature creation with ID generation
 */
export class FeatureModel {
  private id: FeatureId;
  private feature: Feature;

  /**
   * Create a new FeatureModel instance
   *
   * @param feature - Feature data
   */
  private constructor(feature: Feature) {
    // Validate with Zod
    const validatedFeature = FeatureSchema.parse(feature);
    this.feature = validatedFeature;
    this.id = toFeatureId(validatedFeature.id);
  }

  // ==========================================================================
  // Factory Methods
  // ==========================================================================

  /**
   * Create FeatureModel from partial feature data
   *
   * @param data - Partial feature data
   * @returns FeatureModel instance
   */
  static create(data: Partial<Feature>): FeatureModel {
    const now = new Date().toISOString();

    // Generate feature ID if not provided
    const featureId = data.id || FeatureModel.generateFeatureId();

    // Create feature with defaults
    const feature: Feature = {
      id: featureId,
      category: data.category || 'Uncategorized',
      description: data.description || '',
      status: data.status || 'pending',
      imagePaths: data.imagePaths || [],
      textFilePaths: data.textFilePaths || [],
      branchName: data.branchName,
      ...data,
    };

    return new FeatureModel(feature);
  }

  /**
   * Create FeatureModel from project path and feature ID
   *
   * @param projectPath - Project root path
   * @param featureId - Feature ID
   * @returns FeatureModel instance or null if not found
   */
  static async fromPath(projectPath: string, featureId: string): Promise<FeatureModel | null> {
    // Import dynamically to avoid circular dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FeatureLoader } = require('../services/feature-loader.js');
    const loader = new FeatureLoader();

    const feature = await loader.get(projectPath, featureId);
    if (!feature) {
      return null;
    }

    return new FeatureModel(feature);
  }

  /**
   * Create FeatureModel from API feature data
   *
   * @param apiFeature - Feature data from API
   * @returns FeatureModel instance
   */
  static fromAPI(apiFeature: Feature): FeatureModel {
    return FeatureModel.create(apiFeature);
  }

  // ==========================================================================
  // State Transition Methods (Immutable)
  // ==========================================================================

  /**
   * Transition feature to 'running' status
   *
   * @returns New FeatureModel instance (immutable)
   */
  start(): FeatureModel {
    if (!this.canStart()) {
      throw new Error(
        `Feature ${this.id} cannot start (current status: ${this.getStatus()}, blocked: ${this.isBlocked()})`
      );
    }

    const updatedFeature: Feature = {
      ...this.feature,
      status: 'running',
      startedAt: new Date().toISOString(),
    };

    return new FeatureModel(updatedFeature);
  }

  /**
   * Transition feature to 'completed' status
   *
   * @returns New FeatureModel instance (immutable)
   */
  complete(): FeatureModel {
    if (!this.canComplete()) {
      throw new Error(`Feature ${this.id} cannot complete (current status: ${this.getStatus()})`);
    }

    const updatedFeature: Feature = {
      ...this.feature,
      status: 'completed',
    };

    return new FeatureModel(updatedFeature);
  }

  /**
   * Transition feature to 'verified' status
   *
   * @returns New FeatureModel instance (immutable)
   */
  verify(): FeatureModel {
    if (this.getStatus() !== 'completed') {
      throw new Error(`Feature ${this.id} cannot verify (must be completed first)`);
    }

    const updatedFeature: Feature = {
      ...this.feature,
      status: 'verified',
    };

    return new FeatureModel(updatedFeature);
  }

  /**
   * Mark feature as failed
   *
   * @param error - Error message
   * @param permanent - Whether this is a permanent failure
   * @returns New FeatureModel instance (immutable)
   */
  fail(error: string, permanent = false): FeatureModel {
    const updatedFeature: Feature = {
      ...this.feature,
      status: permanent ? 'failed' : this.getStatus(),
      error,
      permanentlyFailed: permanent,
      permanentFailureReason: permanent ? error : undefined,
      failureCount: (this.feature.failureCount || 0) + 1,
      lastFailedAt: new Date().toISOString(),
    };

    return new FeatureModel(updatedFeature);
  }

  /**
   * Delete feature (prepare for deletion)
   *
   * @returns New FeatureModel instance with deleted state marker
   */
  delete(): FeatureModel {
    const updatedFeature: Feature = {
      ...this.feature,
      status: 'deleted',
    };

    return new FeatureModel(updatedFeature);
  }

  // ==========================================================================
  // Business Logic Methods
  // ==========================================================================

  /**
   * Check if feature can transition to a new status
   *
   * Valid transitions:
   * - pending → running
   * - running → completed
   * - completed → verified
   * - any → failed
   * - failed → running (retry)
   *
   * @param newStatus - Target status
   * @returns True if transition is valid
   */
  canTransitionTo(newStatus: FeatureStatus): boolean {
    const currentStatus = this.getStatus();

    // Cannot transition from completed or verified (except to verified)
    if (currentStatus === 'completed' || currentStatus === 'verified') {
      return newStatus === 'verified' && currentStatus === 'completed';
    }

    // Can always transition to failed
    if (newStatus === 'failed') {
      return true;
    }

    // Can retry from failed to running
    if (currentStatus === 'failed' && newStatus === 'running') {
      return true;
    }

    // Normal transitions
    const validTransitions: Record<string, FeatureStatus[]> = {
      pending: ['running'],
      running: ['completed'],
      completed: ['verified'],
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  /**
   * Check if feature is ready to start
   *
   * Feature is ready if:
   * - Status is 'pending'
   * - Not blocked by dependencies
   * - Not permanently failed
   *
   * @returns True if feature can be started
   */
  isReadyToStart(): boolean {
    // Must be in pending status
    if (this.getStatus() !== 'pending') {
      return false;
    }

    // Cannot start if permanently failed
    if (this.feature.permanentlyFailed) {
      return false;
    }

    // Cannot start if blocked by dependencies
    return !this.isBlocked();
  }

  /**
   * Check if feature is blocked by dependencies
   *
   * @returns True if has unresolved dependencies
   */
  isBlocked(): boolean {
    if (!this.feature.dependencies || this.feature.dependencies.length === 0) {
      return false;
    }

    // In a real system, this would check if dependencies are completed
    // For now, we just check if dependencies exist
    return this.feature.dependencies.length > 0;
  }

  /**
   * Check if feature can start (alias for isReadyToStart)
   *
   * @returns True if feature can be started
   */
  canStart(): boolean {
    return this.isReadyToStart();
  }

  /**
   * Check if feature can be marked as completed
   *
   * @returns True if feature can complete
   */
  canComplete(): boolean {
    return this.getStatus() === 'running';
  }

  /**
   * Check if feature is completed
   *
   * @returns True if status is 'completed' or 'verified'
   */
  isCompleted(): boolean {
    return this.getStatus() === 'completed' || this.getStatus() === 'verified';
  }

  /**
   * Check if feature is running
   *
   * @returns True if status is 'running'
   */
  isRunning(): boolean {
    return this.getStatus() === 'running';
  }

  /**
   * Check if feature has failed
   *
   * @returns True if status is 'failed'
   */
  hasFailed(): boolean {
    return this.getStatus() === 'failed' || this.feature.permanentlyFailed === true;
  }

  /**
   * Check if feature requires approval before implementation
   *
   * @returns True if requirePlanApproval is true
   */
  requiresApproval(): boolean {
    return this.feature.requirePlanApproval === true;
  }

  /**
   * Check if plan is approved for implementation
   *
   * @returns True if planSpec exists and is approved
   */
  isPlanApproved(): boolean {
    return this.feature.planSpec?.status === 'approved';
  }

  // ==========================================================================
  // Image Management Methods
  // ==========================================================================

  /**
   * Add an image to the feature
   *
   * @param imagePath - Image path (string or object)
   * @returns New FeatureModel instance (immutable)
   */
  addImage(
    imagePath: string | FeatureImagePath | { path: string; [key: string]: unknown }
  ): FeatureModel {
    const updatedImagePaths = [...(this.feature.imagePaths || []), imagePath];

    const updatedFeature: Feature = {
      ...this.feature,
      imagePaths: updatedImagePaths,
    };

    return new FeatureModel(updatedFeature);
  }

  /**
   * Remove an image from the feature
   *
   * @param imagePath - Image path to remove
   * @returns New FeatureModel instance (immutable)
   */
  removeImage(imagePath: string): FeatureModel {
    if (!this.feature.imagePaths) {
      return this;
    }

    const updatedImagePaths = this.feature.imagePaths.filter((img) => {
      const path = typeof img === 'string' ? img : img.path;
      return path !== imagePath;
    });

    const updatedFeature: Feature = {
      ...this.feature,
      imagePaths: updatedImagePaths,
    };

    return new FeatureModel(updatedFeature);
  }

  /**
   * Migrate images from temp directory to feature directory
   *
   * @param projectPath - Project root path
   * @param targetDir - Target feature images directory
   * @returns Migrated image paths
   */
  async migrateImages(
    projectPath: string,
    targetDir: string
  ): Promise<Array<string | { path: string; [key: string]: unknown }>> {
    // Import secureFs for file operations
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const secureFs = require('../lib/secure-fs.js');
    const path = await import('path');

    if (!this.feature.imagePaths || this.feature.imagePaths.length === 0) {
      return [];
    }

    const updatedPaths: Array<string | { path: string; [key: string]: unknown }> = [];

    for (const imagePath of this.feature.imagePaths) {
      try {
        const originalPath = typeof imagePath === 'string' ? imagePath : imagePath.path;

        // Skip if already in feature directory
        if (originalPath.includes(`/features/${this.id}/images/`)) {
          updatedPaths.push(imagePath);
          continue;
        }

        // Resolve the full path
        const fullOriginalPath = path.isAbsolute(originalPath)
          ? originalPath
          : path.join(projectPath, originalPath);

        // Check if file exists
        try {
          await secureFs.access(fullOriginalPath);
        } catch {
          console.warn(`[FeatureModel] Image not found, skipping: ${fullOriginalPath}`);
          continue;
        }

        // Get filename and create new path
        const filename = path.basename(originalPath);
        const newPath = path.join(targetDir, filename);

        // Copy the file
        await secureFs.copyFile(fullOriginalPath, newPath);
        console.log(`[FeatureModel] Copied image: ${originalPath} -> ${newPath}`);

        // Try to delete the original temp file
        try {
          await secureFs.unlink(fullOriginalPath);
        } catch {
          // Ignore errors when deleting temp file
        }

        // Update the path (use absolute path)
        if (typeof imagePath === 'string') {
          updatedPaths.push(newPath);
        } else {
          updatedPaths.push({ ...imagePath, path: newPath });
        }
      } catch (error) {
        console.error(`[FeatureModel] Failed to migrate image:`, error);
        throw error;
      }
    }

    return updatedPaths;
  }

  /**
   * Check if feature has orphaned images
   *
   * @param existingImages - Current images in filesystem
   * @returns True if there are orphaned images
   */
  hasOrphanedImages(existingImages: string[]): boolean {
    if (!this.feature.imagePaths) {
      return false;
    }

    const featureImageSet = new Set(
      this.feature.imagePaths.map((img) => (typeof img === 'string' ? img : img.path))
    );

    // Find images that exist in filesystem but not in feature
    const orphanedImages = existingImages.filter((img) => !featureImageSet.has(img));

    return orphanedImages.length > 0;
  }

  /**
   * Get orphaned images (images in filesystem but not in feature)
   *
   * @param existingImages - Current images in filesystem
   * @returns Array of orphaned image paths
   */
  getOrphanedImages(existingImages: string[]): string[] {
    if (!this.feature.imagePaths) {
      return [];
    }

    const featureImageSet = new Set(
      this.feature.imagePaths.map((img) => (typeof img === 'string' ? img : img.path))
    );

    return existingImages.filter((img) => !featureImageSet.has(img));
  }

  /**
   * Remove all images from feature
   *
   * @returns New FeatureModel instance (immutable)
   */
  clearImages(): FeatureModel {
    const updatedFeature: Feature = {
      ...this.feature,
      imagePaths: [],
    };

    return new FeatureModel(updatedFeature);
  }

  // ==========================================================================
  // Validation Methods
  // ==========================================================================

  /**
   * Validate feature configuration
   *
   * @returns Validation result with errors if any
   */
  validate(): { valid: boolean; errors: string[] } {
    try {
      FeatureSchema.parse(this.feature);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
        return { valid: false, errors };
      }
      return { valid: false, errors: ['Unknown validation error'] };
    }
  }

  /**
   * Check if feature has required fields
   *
   * @returns True if all required fields are present
   */
  hasRequiredFields(): boolean {
    return !!(this.feature.id && this.feature.category && this.feature.description !== undefined);
  }

  // ==========================================================================
  // Conversion Methods
  // ==========================================================================

  /**
   * Convert to plain Feature object (for API responses)
   *
   * @returns Feature data
   */
  toJSON(): Feature {
    return { ...this.feature };
  }

  /**
   * Convert to JSON string
   *
   * @returns JSON string representation
   */
  toJSONString(): string {
    return JSON.stringify(this.feature, null, 2);
  }

  // ==========================================================================
  // Getters
  // ==========================================================================

  /**
   * Get feature ID
   */
  getId(): FeatureId {
    return this.id;
  }

  /**
   * Get feature title
   */
  getTitle(): string | undefined {
    return this.feature.title;
  }

  /**
   * Get feature category
   */
  getCategory(): string {
    return this.feature.category;
  }

  /**
   * Get feature description
   */
  getDescription(): string {
    return this.feature.description;
  }

  /**
   * Get feature status
   */
  getStatus(): FeatureStatus {
    return this.feature.status as FeatureStatus;
  }

  /**
   * Get feature priority
   */
  getPriority(): number | undefined {
    return this.feature.priority;
  }

  /**
   * Get feature dependencies
   */
  getDependencies(): string[] {
    return this.feature.dependencies || [];
  }

  /**
   * Get image paths
   */
  getImagePaths(): Array<string | FeatureImagePath | { path: string; [key: string]: unknown }> {
    return this.feature.imagePaths || [];
  }

  /**
   * Get text file paths
   */
  getTextFilePaths(): FeatureTextFilePath[] {
    return this.feature.textFilePaths || [];
  }

  /**
   * Get feature error (if any)
   */
  getError(): string | undefined {
    return this.feature.error;
  }

  /**
   * Get feature summary
   */
  getSummary(): string | undefined {
    return this.feature.summary;
  }

  /**
   * Get branch name
   */
  getBranchName(): string | undefined {
    return this.feature.branchName;
  }

  /**
   * Check if feature is title generating
   */
  isTitleGenerating(): boolean {
    return this.feature.titleGenerating === true;
  }

  // ==========================================================================
  // Static Helper Methods
  // ==========================================================================

  /**
   * Generate a new feature ID
   *
   * Format: feature-{timestamp}-{random}
   *
   * @returns New feature ID
   */
  static generateFeatureId(): string {
    return `feature-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Validate feature ID format
   *
   * @param id - Feature ID to validate
   * @returns True if valid format
   */
  static isValidFeatureId(id: string): boolean {
    return typeof id === 'string' && id.startsWith('feature-') && id.length > 8;
  }

  /**
   * Extract timestamp from feature ID
   *
   * @param featureId - Feature ID
   * @returns Unix timestamp or null if invalid
   */
  static getTimestampFromId(featureId: string): number | null {
    const parts = featureId.split('-');
    if (parts.length >= 2) {
      const timestamp = parseInt(parts[1], 10);
      return isNaN(timestamp) ? null : timestamp;
    }
    return null;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid FeatureStatus
 *
 * @param value - Value to check
 * @returns True if valid FeatureStatus
 */
export function isValidFeatureStatus(value: unknown): value is FeatureStatus {
  const validStatuses: FeatureStatus[] = ['pending', 'running', 'completed', 'failed', 'verified'];
  return typeof value === 'string' && validStatuses.includes(value as FeatureStatus);
}

/**
 * Validate feature object
 *
 * @param feature - Feature to validate
 * @returns Validation result with errors if any
 */
export function validateFeature(feature: unknown): { valid: boolean; errors: string[] } {
  try {
    FeatureSchema.parse(feature);
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
      return { valid: false, errors };
    }
    return { valid: false, errors: ['Unknown validation error'] };
  }
}
