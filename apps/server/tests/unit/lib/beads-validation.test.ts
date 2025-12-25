/**
 * Tests for Beads validation schemas
 */

import { describe, it, expect } from 'vitest';
import {
  beadsIssueIdSchema,
  beadsIssueStatusSchema,
  beadsIssueTypeSchema,
  beadsIssuePrioritySchema,
  beadsLabelsSchema,
  beadsDependencyTypeSchema,
  createBeadsIssueSchema,
  updateBeadsIssueSchema,
  deleteBeadsIssueSchema,
  addDependencySchema,
  removeDependencySchema,
  listBeadsIssuesFiltersSchema,
  searchBeadsIssuesSchema,
  getStaleIssuesSchema,
} from '@/lib/beads-validation.js';

describe('beads-validation', () => {
  describe('beadsIssueIdSchema', () => {
    it('should accept valid issue IDs', () => {
      expect(beadsIssueIdSchema.safeParse('bd-test123').success).toBe(true);
      expect(beadsIssueIdSchema.safeParse('bd-a1b2c3').success).toBe(true);
      expect(beadsIssueIdSchema.safeParse('bd-test.1').success).toBe(true);
      expect(beadsIssueIdSchema.safeParse('bd-abc123.99').success).toBe(true);
    });

    it('should reject invalid issue IDs', () => {
      const result = beadsIssueIdSchema.safeParse('invalid-id');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid issue ID format');
      }
    });

    it('should reject issue IDs with uppercase letters', () => {
      expect(beadsIssueIdSchema.safeParse('bd-TEST123').success).toBe(false);
    });

    it('should reject issue IDs with special characters', () => {
      expect(beadsIssueIdSchema.safeParse('bd-test!@#').success).toBe(false);
    });
  });

  describe('beadsIssueStatusSchema', () => {
    it('should accept valid status values', () => {
      expect(beadsIssueStatusSchema.safeParse('open').success).toBe(true);
      expect(beadsIssueStatusSchema.safeParse('in_progress').success).toBe(true);
      expect(beadsIssueStatusSchema.safeParse('closed').success).toBe(true);
    });

    it('should reject invalid status values', () => {
      expect(beadsIssueStatusSchema.safeParse('invalid').success).toBe(false);
      expect(beadsIssueStatusSchema.safeParse('').success).toBe(false);
    });
  });

  describe('beadsIssueTypeSchema', () => {
    it('should accept valid type values', () => {
      expect(beadsIssueTypeSchema.safeParse('bug').success).toBe(true);
      expect(beadsIssueTypeSchema.safeParse('feature').success).toBe(true);
      expect(beadsIssueTypeSchema.safeParse('task').success).toBe(true);
      expect(beadsIssueTypeSchema.safeParse('epic').success).toBe(true);
      expect(beadsIssueTypeSchema.safeParse('chore').success).toBe(true);
    });

    it('should reject invalid type values', () => {
      expect(beadsIssueTypeSchema.safeParse('invalid').success).toBe(false);
    });
  });

  describe('beadsIssuePrioritySchema', () => {
    it('should accept valid priority values', () => {
      expect(beadsIssuePrioritySchema.safeParse(0).success).toBe(true);
      expect(beadsIssuePrioritySchema.safeParse(1).success).toBe(true);
      expect(beadsIssuePrioritySchema.safeParse(2).success).toBe(true);
      expect(beadsIssuePrioritySchema.safeParse(3).success).toBe(true);
      expect(beadsIssuePrioritySchema.safeParse(4).success).toBe(true);
    });

    it('should reject out of range values', () => {
      expect(beadsIssuePrioritySchema.safeParse(-1).success).toBe(false);
      expect(beadsIssuePrioritySchema.safeParse(5).success).toBe(false);
    });

    it('should reject non-integer values', () => {
      expect(beadsIssuePrioritySchema.safeParse(1.5).success).toBe(false);
    });
  });

  describe('beadsLabelsSchema', () => {
    it('should accept valid labels array', () => {
      expect(beadsLabelsSchema.safeParse(['bug', 'urgent']).success).toBe(true);
      expect(beadsLabelsSchema.safeParse([]).success).toBe(true);
      expect(beadsLabelsSchema.safeParse(undefined).success).toBe(true);
    });

    it('should reject labels exceeding 50 characters', () => {
      const result = beadsLabelsSchema.safeParse(['a'.repeat(51)]);
      expect(result.success).toBe(false);
    });

    it('should reject more than 10 labels', () => {
      const result = beadsLabelsSchema.safeParse([
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
        '10',
        '11',
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe('createBeadsIssueSchema', () => {
    it('should accept valid input with required fields', () => {
      const result = createBeadsIssueSchema.safeParse({
        title: 'Test issue',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid input with all fields', () => {
      const result = createBeadsIssueSchema.safeParse({
        title: 'Test issue',
        description: 'A test description',
        type: 'bug',
        priority: 0,
        labels: ['urgent', 'frontend'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing title', () => {
      const result = createBeadsIssueSchema.safeParse({
        description: 'No title',
      });
      expect(result.success).toBe(false);
    });

    it('should reject title with invalid characters', () => {
      const result = createBeadsIssueSchema.safeParse({
        title: 'Test <script>',
      });
      expect(result.success).toBe(false);
    });

    it('should reject title exceeding 200 characters', () => {
      const result = createBeadsIssueSchema.safeParse({
        title: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority', () => {
      const result = createBeadsIssueSchema.safeParse({
        title: 'Test',
        priority: 10,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid type', () => {
      const result = createBeadsIssueSchema.safeParse({
        title: 'Test',
        type: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateBeadsIssueSchema', () => {
    it('should accept valid update with title', () => {
      const result = updateBeadsIssueSchema.safeParse({
        title: 'Updated title',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid update with multiple fields', () => {
      const result = updateBeadsIssueSchema.safeParse({
        title: 'Updated title',
        status: 'in_progress',
        priority: 1,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty update', () => {
      const result = updateBeadsIssueSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('At least one field');
      }
    });
  });

  describe('deleteBeadsIssueSchema', () => {
    it('should accept valid delete input', () => {
      const result = deleteBeadsIssueSchema.safeParse({
        issueId: 'bd-test123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid delete input with force flag', () => {
      const result = deleteBeadsIssueSchema.safeParse({
        issueId: 'bd-test123',
        force: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid issue ID', () => {
      const result = deleteBeadsIssueSchema.safeParse({
        issueId: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('addDependencySchema', () => {
    it('should accept valid dependency', () => {
      const result = addDependencySchema.safeParse({
        issueId: 'bd-issue1',
        depId: 'bd-issue2',
        type: 'blocks',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid dependency type', () => {
      const result = addDependencySchema.safeParse({
        issueId: 'bd-issue1',
        depId: 'bd-issue2',
        type: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('listBeadsIssuesFiltersSchema', () => {
    it('should accept empty filters', () => {
      const result = listBeadsIssuesFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept status filter', () => {
      const result = listBeadsIssuesFiltersSchema.safeParse({
        status: ['open', 'in_progress'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept priority range filter', () => {
      const result = listBeadsIssuesFiltersSchema.safeParse({
        priorityMin: 0,
        priorityMax: 2,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = listBeadsIssuesFiltersSchema.safeParse({
        status: ['invalid'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject unknown properties', () => {
      const result = listBeadsIssuesFiltersSchema.safeParse({
        unknown: 'value',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('searchBeadsIssuesSchema', () => {
    it('should accept valid search query', () => {
      const result = searchBeadsIssuesSchema.safeParse({
        query: 'test search',
      });
      expect(result.success).toBe(true);
    });

    it('should accept search with limit', () => {
      const result = searchBeadsIssuesSchema.safeParse({
        query: 'test',
        limit: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty query', () => {
      const result = searchBeadsIssuesSchema.safeParse({
        query: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit out of range', () => {
      const result = searchBeadsIssuesSchema.safeParse({
        query: 'test',
        limit: 101,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('getStaleIssuesSchema', () => {
    it('should accept empty input', () => {
      const result = getStaleIssuesSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept valid days value', () => {
      const result = getStaleIssuesSchema.safeParse({
        days: 30,
      });
      expect(result.success).toBe(true);
    });

    it('should reject days out of range', () => {
      const result = getStaleIssuesSchema.safeParse({
        days: 400,
      });
      expect(result.success).toBe(false);
    });
  });
});
